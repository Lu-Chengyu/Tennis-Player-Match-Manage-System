const { spawn, spawnSync } = require('child_process');

class Process {
  /// MEMBERS (in constructor)
  /*
    _waitSpawn
    _waitExit
    _exitCode
  */


  /// CMD

  get cmd() {
    return this._cmd || '';
  }

  set cmd(val) {
    this._cmd = val;
  }


  /// ARGS

  get args() {
    if (!this._args) {
      this.args = [];
    }
    return this._args;
  }


  set args(val) {
    if (!Array.isArray(val)) {
      val = [val];
    }
    this._args = val;
  }


  /// STDOUT

  get stdout() {
    if (!this._stdout) {
      this.stdout = '';
    }
    return this._stdout;
  }


  set stdout(val) {
    this._stdout = val;
  }


  /// STDERR

  get stderr() {
    if (!this._stderr) {
      this.stderr = '';
    }
    return this._stderr;
  }


  set stderr(val) {
    this._stderr = val;
  }


  /// PS

  get ps() {
    return this._ps || null;
  }


  set ps(val) {
    this._ps = val;
  }


  /// KILLED

  get killed() {
    return this._killed || false;
  }


  set killed(val) {
    this._killed = val;
  }


  /// FLOW CONTROL

  waitSpawn() {
    if (!this.ps) {
      throw new Error(`wait spawn promise invalid before start -- cmd:${this}`);
    }

    return this._waitSpawn;
  }


  waitExit() {
    if (!this.ps) {
      throw new Error(`wait exit promise invalid before start -- cmd:${this}`);
    }

    return this._waitExit;
  }


  waitError() {
    if (!this.ps) {
      throw new Error(`wait exit promise invalid before start -- cmd:${this}`);
    }

    return this._waitExit;
  }


  waitClose() {
    if (!this.ps) {
      throw new Error(`wait close promise invalid before start -- cmd:${this}`);
    }

    return this._waitClose;
  }


  constructor(cmd, args = [], opts = { printOnClose: false }) {
    this.cmd = cmd;
    this.args = args;

    this.stdout = '';
    this.stderr = '';

    this.printOnClose = opts.printOnClose;
  }


  toString() {
    return `${this.cmd} ${this.args.join(' ')}`;
  }


  // on(event, fn) {
  //   if(this.ps) {
  //     this.ps.on('event', fn);
  //   } else {
  //     throw new Error(`executing event listener beofre entity set -- event:${event}`) ;
  //   }    
  // }


  start(timeout_ms = null) {
    if (this.ps) {
      throw new Error(`process already started -- cmd:${this}`);
    }

    const ps = spawn(this.cmd, this.args);

    ps.stdout.on('data', d => {
      this.stdout += d;
    });
    ps.stderr.on('data', d => {
      this.stderr += d;
    });

    let timeoutId;
    if (timeout_ms > 0) {
      timeoutId = setTimeout(() => {
        // console.error(`process timeout, SIGKILL`);
        ps.kill('SIGKILL'), timeout_ms;
      }, timeout_ms);
    }

    // if error before spawn
    ps.on('error', err => {
      // clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // console.error(`SUBPROCESS ERROR: ${err.message}`);
      if (this.stderr) {
        // console.error(this.stderr.toString());
      }
      if (this.stdout) {
        // console.log(this.stdout.toString());
      }
    });

    // if error after spawn
    ps.on('exit', (exitCode, signal) => {
      this.exitCode = exitCode;

      // clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // below only if not "internal" kill
      // may need to rewrite if I am missing something
      if (this.killed) {
        return;
      }

      // console.error(`SUBPROCESS EXIT`);
      if (this.stderr) {
        process.stderr.write(this.stderr.toString());
      }
      if (this.stdout) {
        process.stdout.write(this.stdout.toString());
      }
    });

    this._waitSpawn = new Promise((resolve, reject) => {
      ps.on('error', reject);
      ps.on('spawn', resolve);
    });

    this._waitExit = new Promise((resolve, reject) => {
      ps.on('error', reject);
      ps.on('exit', resolve);
    });

    this._waitError = new Promise((resolve, reject) => {
      ps.on('spawn', reject);
      ps.on('error', reject);
      ps.on('exit', resolve);
    });

    ps.on('close', () => {
      if (!this.printOnClose) {
        return;
      }

      if (this.stderr) {
        console.error(this.stderr.toString());
      }
      if (this.stdout) {
        console.log(this.stdout.toString());
      }
    });

    // and save
    this.ps = ps;
  }


  kill(signal = 'SIGINT') {
    this.killed = true;
    return this.ps.kill(signal);
  }


  startSync(options, require_success = true) {
    const r = spawnSync(this.cmd, this.args, { ...options });

    this.exitCode = r.status;
    this.stdout = r.stdout.toString();
    this.stderr = r.stderr.toString();

    if (r.signal) {
      this.killed = true;
    }
    
    if (this.printOnClose) {
      if (this.stderr) {
        console.error(this.stderr.toString());
      }
      if (this.stdout) {
        console.log(this.stdout.toString());
      }
    }

    if (require_success && r.status !== 0) {
      // console.error(r.stderr.toString());
      // console.error(r.stdout.toString());
      throw new Error(`error during startSync command -- ${this.toString()}`);
    }
  }
}


module.exports = {
  Process
};
