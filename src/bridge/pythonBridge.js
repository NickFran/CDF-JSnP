const { spawn } = require('node:child_process');

/**
 * @callback PythonBridgeMessageHandler
 * @param {unknown} payload - A parsed non-request payload or an unparsed stdout event description.
 * @returns {void}
 */

/**
 * @callback PythonBridgeStderrHandler
 * @param {string} message - Raw stderr text emitted by the Python child process.
 * @returns {void}
 */

/**
 * @typedef {Object} PythonBridgeOptions
 * @property {string} pythonExecutable - Executable or command used to launch Python.
 * @property {string} scriptPath - Absolute path to the Python runtime script.
 * @property {Record<string, string | undefined>} [env] - Extra environment variables merged into the child process.
 * @property {string} [cwd] - Working directory for the Python child process.
 * @property {number} [defaultTimeoutMs=90000] - Default timeout applied to requests sent through the bridge.
 * @property {string[]} [spawnArgs] - Extra arguments inserted between the Python executable and the script path.
 * @property {PythonBridgeMessageHandler} [onMessage] - Callback for non-request stdout payloads.
 * @property {PythonBridgeStderrHandler} [onStderr] - Callback for stderr output from Python.
 */

/**
 * @typedef {Object} PythonSendOptions
 * @property {number} [timeoutMs] - Override for the timeout of the current request.
 */

class PythonBridge {
  /**
   * Create a bridge that keeps one Python child process alive across many requests.
   *
   * @param {PythonBridgeOptions} [options={}] - Process-launch and request-handling configuration.
   */
  constructor(options = {}) {
    const {
      pythonExecutable,
      scriptPath,
      env = {},
      cwd,
      defaultTimeoutMs = 90000,
      spawnArgs = [],
      onMessage,
      onStderr,
    } = options;

    if (!pythonExecutable) {
      throw new Error('pythonExecutable is required.');
    }

    if (!scriptPath) {
      throw new Error('scriptPath is required.');
    }

    this.pythonExecutable = pythonExecutable;
    this.scriptPath = scriptPath;
    this.env = env;
    this.cwd = cwd;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.spawnArgs = Array.isArray(spawnArgs) ? spawnArgs.slice() : [];
    this.onMessage = onMessage;
    this.onStderr = onStderr;

    this.pyProc = null;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.pending = new Map();
    this.nextRequestId = 1;
  }

  /**
   * Start the Python child process on first use and wire up stdout/stderr handling.
   *
   * @returns {void}
   */
  ensureProcess() {
    if (this.pyProc && !this.pyProc.killed) {
      return;
    }

    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    const env = { ...process.env, ...this.env };
    delete env.PYTHONHOME;
    delete env.PYTHONPATH;

    this.pyProc = spawn(
      this.pythonExecutable,
      [...this.spawnArgs, this.scriptPath],
      {
        cwd: this.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    this.pyProc.stdout.on('data', (chunk) => {
      this.stdoutBuffer += chunk.toString();
      let newlineIndex = this.stdoutBuffer.indexOf('\n');

      while (newlineIndex !== -1) {
        const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

        if (line) {
          this.handleStdoutLine(line);
        }

        newlineIndex = this.stdoutBuffer.indexOf('\n');
      }
    });

    this.pyProc.stderr.on('data', (chunk) => {
      const message = chunk.toString();
      this.stderrBuffer += message;
      if (typeof this.onStderr === 'function') {
        this.onStderr(message);
      }
    });

    this.pyProc.on('exit', (code, signal) => {
      this.pyProc = null;
      const exitDetails = signal
        ? `Python process exited with signal ${signal}`
        : `Python process exited with code ${code}`;
      const errorMessage = this.stderrBuffer
        ? `${exitDetails}: ${this.stderrBuffer}`
        : exitDetails;
      this.rejectAllPending(new Error(errorMessage));
    });

    this.pyProc.on('error', (error) => {
      this.pyProc = null;
      this.rejectAllPending(error);
    });
  }

  /**
   * Parse one stdout line from Python and route the payload to the matching request.
   *
   * @param {string} line - One newline-delimited stdout line emitted by the Python runtime.
   * @returns {void}
   */
  handleStdoutLine(line) {
    let payload;

    try {
      payload = JSON.parse(line);
    } catch (error) {
      if (typeof this.onMessage === 'function') {
        this.onMessage({ type: 'unparsed-stdout', line, error });
      }
      return;
    }

    const requestId = payload && payload.id != null ? String(payload.id) : null;

    if (!requestId || !this.pending.has(requestId)) {
      if (typeof this.onMessage === 'function') {
        this.onMessage(payload);
      }
      return;
    }

    const pendingRequest = this.pending.get(requestId);
    this.pending.delete(requestId);

    if (payload.ok) {
      pendingRequest.resolve(payload.result);
      return;
    }

    pendingRequest.reject(new Error(payload.error || 'Python error'));
  }

  /**
   * Send one command to Python and resolve when the matching response is received.
   *
   * @param {string} command - Runtime command name to execute in Python.
   * @param {unknown[] | unknown} [args=[]] - Positional arguments for the Python command.
   * @param {PythonSendOptions} [options={}] - Per-request timeout overrides.
   * @returns {Promise<unknown>} Promise that resolves with the Python command result.
   */
  send(command, args = [], options = {}) {
    const safeArgs = Array.isArray(args) ? args : [args];
    const timeoutMs = typeof options.timeoutMs === 'number'
      ? options.timeoutMs
      : this.defaultTimeoutMs;
    const requestId = String(this.nextRequestId++);

    this.ensureProcess();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            `Timeout waiting for Python response: ${command}(${JSON.stringify(safeArgs)})`
          )
        );
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      const request = JSON.stringify({
        id: requestId,
        command,
        args: safeArgs,
      });

      try {
        this.pyProc.stdin.write(`${request}\n`);
      } catch (error) {
        this.pending.delete(requestId);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Reject every in-flight request because the Python process can no longer answer them.
   *
   * @param {Error} error - Error propagated to each pending request.
   * @returns {void}
   */
  rejectAllPending(error) {
    for (const [requestId, pendingRequest] of this.pending.entries()) {
      this.pending.delete(requestId);
      pendingRequest.reject(error);
    }
  }

  /**
   * Shut down the child process and reject any requests still waiting for a response.
   *
   * @returns {void}
   */
  dispose() {
    if (!this.pyProc) {
      return;
    }

    const activeProcess = this.pyProc;
    this.pyProc = null;

    try {
      activeProcess.stdin.end();
    } catch (error) {
      // Ignore broken pipe errors during shutdown.
    }

    if (!activeProcess.killed) {
      activeProcess.kill();
    }

    this.rejectAllPending(new Error('Python bridge disposed.'));
  }
}

/**
 * Create a new Python bridge instance without using `new` directly.
 *
 * @param {PythonBridgeOptions} options - Process-launch and request-handling configuration.
 * @returns {PythonBridge} Configured bridge instance.
 */
function createPythonBridge(options) {
  return new PythonBridge(options);
}

module.exports = {
  PythonBridge,
  createPythonBridge,
};
