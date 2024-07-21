'use strict';

require('./assert');


const { _ } = require('lodash');

const chai = require('chai');
const { expect } = chai;

const axios = require('axios');
const querystring = require('querystring');
const fs = require('fs');

const { HtmlValidate } = require('html-validate');

const { Process } = require('./process');

/**************************************/

const DEFAULT_TIMEOUT_MS = 4e3;
const START_SCRIPT = true;

const TEST_PATH = '/ping';
const LIVE_TEST_INTERVAL_MS = 10;
const LIVE_TIMEOUT_MS = 2e3;

const DEFAULT_WWW = {
  host:  'localhost',
  port:  '3000',
  proto: 'http'
}

// printOnClose, if true print STDOUT/STDERR from tested process upon exit
//               else hidden
const EXTRA_PROCESS_OPTS = {
  printOnClose: false
};

/**************************************/


class Fixture {
  constructor(interpreter, scriptToTest) {
    if (!scriptToTest || !interpreter) {
      throw new Error(`fixture arguement missing -- interpreter:${interpreter}, scriptToTest:${scriptToTest}`);
    }

    this.interpreter = interpreter;    
    this.scriptToTest = scriptToTest;
    
    this.wwwProtocol = DEFAULT_WWW.proto;
    this.wwwHostname = DEFAULT_WWW.host;
    this.wwwPort = DEFAULT_WWW.port;

    this.defaultAxiosOpts = {
      transformRequest:  [_.identity],
      transformResponse: [_.identity],
      validateStatus:    _.constant(true),
      maxRedirects:      0
    };

    this.defaultHtmlValidateRules = {
      extends: [
        'html-validate:recommended',
        'html-validate:document'
      ],
      rules: {
        'close-order': 'error',
        'element-required-content': 
          ['warn', { style: 'omit' }],
        "long-title": ["error", { "maxlength": 120 }],
        "no-trailing-whitespace": "off",
        "require-sri": "off",
        "element-permitted-content": "off"
      }
    };
  }

  
  setWwwOpts({ host, port, proto }) {
    if (host) {
      this.wwwHostname = host;
    }
    
    if (port) {
      this.wwwPort = port;
    }
    
    if (proto) {
      this.wwwProtocol = proto;
    }
  }


  async before() {
    if (START_SCRIPT) {
      await this.start();
    }
  }


  async after() {
    if (START_SCRIPT) {
      await this.stop();
    }
  }


  // if noHeartbeat then skip life check
  async start() {
    if (this.ps && this.ps.exitCode === undefined) {
      // already running
      return;
    }

    this.ps = new Process(this.interpreter, [this.scriptToTest], EXTRA_PROCESS_OPTS);
    this.ps.start(DEFAULT_TIMEOUT_MS);

    await this.ps.waitSpawn();

    return new Promise((resolve, reject) => {
      const url = this.url(TEST_PATH);

      const intervalId = setInterval(async () => {
        try {
          await axios(url);
          clearTimeout(timeoutId);
          clearInterval(intervalId);
          resolve();
        } catch(e) {
          // fallthrough
        }
      }, LIVE_TEST_INTERVAL_MS);
  
      const timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        reject(new Error(`timeout: web server not live -- timeout:${LIVE_TIMEOUT_MS}, url:${url}`));
      }, LIVE_TIMEOUT_MS);

      this.ps.waitError().catch(err => {
        clearTimeout(timeoutId);
        clearInterval(intervalId);
        reject(new Error(`premature exit, ${this.ps.toString()} -- err:${err.message}`));
      });
    });    
  }


  // useful to test exit conditions or cases where script should not start
  async start_sync(timeoutMs = 0, opts = {}) {
    if (this.ps && this.ps.exitCode === undefined) {
      // already running
      return;
    }

    const require_success = false;

    if (timeoutMs) {
      opts.timeout = timeoutMs;
    }

    this.ps = new Process(this.interpreter, [this.scriptToTest], {...EXTRA_PROCESS_OPTS, ...opts});
    return this.ps.startSync(opts, require_success);
  }


  async stop() {
    if (!this.ps || this.ps.exitCode !== undefined) {
      // not running, or already stopped
      return;
    }

    this.ps.kill();
    await this.ps.waitExit();
  }


  // REQUEST UTILS

  url(pathname, params = {}) {
    // default
    const url = new URL(`http://localhost${pathname}`);

    if (this.wwwProtocol) {
      url.protocol = this.wwwProtocol;
    }

    if (this.wwwHostname) {
      url.hostname = this.wwwHostname;
    }

    if (this.wwwPort) {
      url.port = this.wwwPort;
    }

    if (Object.keys(params).length > 0) {
      url.search = querystring.stringify(params);
    }

    return url.toString();
  }


  // check that response contains exp_partial (at least)
  // if object, check keys+vals; if array, check keys
  async test_succeed(method, path, { data, query } = {}, exp_status_code = null, exp_partial = null) {
    const url = this.url(path, query);
    const { body, status, headers } = await this.request(method, url, data);
    
    if (!_.isNil(exp_status_code)) {
      expect(status).to.be.equal(exp_status_code);
    }

    const contentType = this.getPropertyCaseInsensitive(headers, 'Content-Type');

    if (contentType && contentType.match(/^application\/json/)) {
      expect(body).to.be.valid.json;

      const d = (body.length > 0 ? JSON.parse(body) : '');

      if (_.isArray(exp_partial)) {
        for (const exp_key of exp_partial) {
          expect(d).to.have.property(exp_key);
        }
      }
      
      if (_.isPlainObject(exp_partial)) {
        for (const exp_key in exp_partial) {
          expect(d).to.have.property(exp_key);
          expect(d[exp_key]).to.equal(exp_partial[exp_key]);
        }
      }
    }
    
    return { body, headers, status };
  }


  async test_forward(method, path, { data, query } = {}, exp_status_code = null, exp_partial = null) {
    const url = this.url(path, query);
    const { body, status, headers } = await this.request(method, url, data);

    if (!_.isNil(exp_status_code)) {
      expect(status).to.be.equal(exp_status_code);
    }
    
    // body is OK
    //expect(body).to.be.equal('');
    
    // redirected request
    expect(headers).to.have.property('location');
    return this.test_succeed('GET', headers.location, {}, null, exp_partial);
  }


  async test_fail(method, path, { data, query } = {}, exp_status_code = null, exp_key = null) {
    const url = this.url(path, query);
    const { body, status, headers } = await this.request(method, url, data);

    if (!_.isNil(exp_status_code)) {
      expect(status).to.be.equal(exp_status_code);
    }

    if (!_.isNil(exp_key)) {
      expect(body).to.include(exp_key);
    }

    return { body, headers, status };
  }


  // axiosOpts, { data, _headers, ...}
  async request(method, url, body = null, axiosOpts = {}) {
    axiosOpts = {
      ...this.defaultAxiosOpts,
      ...axiosOpts,
      headers: {},
      method,
      url
    };

    if (body) {
      axiosOpts.data = JSON.stringify(body);
      axiosOpts.headers['Content-Type'] = 'application/json';
    }

    const res = await axios(axiosOpts);

    return { body: res.data, headers: res.headers, status: res.status };
  }

  
  requireValidHtml(str = '', htmlValidateRules = {}) {
    htmlValidateRules = {...this.defaultHtmlValidateRules, ...htmlValidateRules};

    const htmlValidate = new HtmlValidate(htmlValidateRules);
    const {
      errorCount = -1,
      results: [ { messages = [] } = {} ] = [],
      valid = false,
      warningCount = -1
    } = htmlValidate.validateString(str);
    
    const mms = messages
      .map(m => `${m.ruleId}: ${m.message}\n${m.ruleUrl}\nel: ${m.selector}`)
      .join('\n\n')

    expect(errorCount, `\n${mms}`).to.be.equal(0);
    expect(valid).to.be.true;
  }


  getPropertyCaseInsensitive(obj = {}, findKey = '') {
    for (const key in obj) {
      if (key.toLowerCase() === findKey.toLowerCase()) {
        return obj[key];
      }
    }
    return undefined;
  }


  // ENTITY HELPERS
}


module.exports = {
  Fixture
}
