'use strict';

const { assert, expect } = require('chai');

const fs = require('fs');

const DEFAULT_TIMEOUT_MS = 4e3;
const { Fixture } = require('./fixture_serverREST');

const {
  random_string
} = require('../lib/util');


describe('player api', function () {
  const DEFAULT_PATH   = Fixture.URL_MAP.PLAYER_LIST.path;
  const DEFAULT_METHOD = Fixture.URL_MAP.PLAYER_LIST.method;

  this.timeout(DEFAULT_TIMEOUT_MS);

  const fix = new Fixture();

  before(() => fix.before());
  after(() => fix.after());

  context('express route', () => {
    it('route exists', async () => {
      const url = fix.url(DEFAULT_PATH);
      const { body, status, headers } = await fix.request(DEFAULT_METHOD, url);
      
      expect(status).to.be.equal(200);
    });

    it('response code is 200', async () => {
      const url = fix.url(DEFAULT_PATH);
      const { body, status, headers } = await fix.request(DEFAULT_METHOD, url);
      
      expect(status).to.be.equal(200);
    });

    it('response header, Content-Type = application/json', async () => {
      const url = fix.url(DEFAULT_PATH);
      const { headers } = await fix.request(DEFAULT_METHOD, url);

      const contentType = fix.getPropertyCaseInsensitive(headers, 'content-type');
      expect(contentType)
        .to.be.a('string')
        .and.satisfy(s => s.startsWith('application/json'), `${contentType} does not match application/json`);
    });
  });


  context('page source', () => {
    it('is valid json', async () => {
      const url = fix.url(DEFAULT_PATH);
      const { body } = await fix.request(DEFAULT_METHOD, url);
      
      expect(body).to.be.valid.json;
    });
  });


  context('is_active', () => {
    beforeEach(() => fix._db_flush());

    it('is_active=*, all', async () => {
      await Promise.all([
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: false }),
        fix._player_create({ is_active: false })
      ]);

      const query = {
        is_active: '*'
      };

      const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

      const d = JSON.parse(body);
      expect(d).to.be.an('array').with.length(5);

      for (const obj of d) {
        expect(obj).to.be.a.model('player');
      }
    });

    it('is_active=true, active', async () => {
      const [pid1, pid2, pid3, ] = await Promise.all([
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: false }),
        fix._player_create({ is_active: false })
      ]);

      const query = {
        is_active: 'true'
      };

      const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

      const d = JSON.parse(body);
      expect(d).to.be.an('array').with.length(3);

      for (const obj of d) {
        expect(obj.is_active).to.be.true;
      }
        
      const _ids = d.map(({ pid }) => pid);
      expect(_ids).to.have.members([pid1, pid2, pid3]);
    });

    it('is_active=false, not active', async () => {
      const [pid1, pid2, ] = await Promise.all([
        fix._player_create({ is_active: false }),
        fix._player_create({ is_active: false }),
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: true })
      ]);

      const query = {
        is_active: 'false'
      };

      const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

      const d = JSON.parse(body);
      expect(d).to.be.an('array').with.length(2);

      for (const obj of d) {
        expect(obj.is_active).to.be.false;
      }
        
      const _ids = d.map(({ pid }) => pid);
      expect(_ids).to.have.members([pid1, pid2]);
    });

    it('default, is_active=*', async () => {
      await Promise.all([
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: true }),
        fix._player_create({ is_active: false }),
        fix._player_create({ is_active: false })
      ]);

      const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, {}, 200);

      const d = JSON.parse(body);
      expect(d).to.be.an('array').with.length(5);
    });
  });


  context('filter, q', () => {
    beforeEach(() => fix._db_flush());

    context('match count', () => {
      it('no match, empty db', async () => {
        const fname = random_string(10);

        const query = {
          q: `${fname};fname`
        }

        const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

        const d = JSON.parse(body);
        expect(d).to.be.an('array').with.length(0);
      });

      it('no match', async () => {
        await Promise.all([
          fix._player_create()
        ]);

        const query = {
          q: `${random_string(10)};fname`
        }

        const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

        const d = JSON.parse(body);
        expect(d).to.be.an('array').with.length(0);
      });
  
      it('match = 1', async () => {
        const fname = random_string(10);

        const [pid1,] = await Promise.all([
          fix._player_create({ fname }),
          fix._player_create()
        ]);

        const query = {
          q: `${fname};fname`
        }

        const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

        const d = JSON.parse(body);
        expect(d).to.be.an('array').with.length(1);
        
        const _ids = d.map(({ pid }) => pid);
        expect(_ids).to.have.members([pid1]);
      });
  
      it('match > 1', async () => {
        const fname = random_string(10);

        const [pid1, pid2] = await Promise.all([
          fix._player_create({ fname }),
          fix._player_create({ fname }),
          fix._player_create()
        ]);

        const query = {
          q: `${fname};fname`
        }

        const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

        const d = JSON.parse(body);
        expect(d).to.be.an('array').with.length(2);
        
        const _ids = d.map(({ pid }) => pid);
        expect(_ids).to.have.members([pid1, pid2]);
      });
    });


    context('partial', () => {
      it('fname', async () => {
        const fname = random_string(10);

        const [pid1, ] = await Promise.all([
          fix._player_create({ fname }),
          fix._player_create()
        ]);

        const query = {
          q: `${fname.substring(0,6)};fname`
        }

        const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

        const d = JSON.parse(body);
        expect(d).to.be.an('array').with.length(1);
        
        const _ids = d.map(({ pid }) => pid);
        expect(_ids).to.have.members([pid1]);
      });
  
      it('lname', async () => {
        const lname = random_string(10);

        const [pid1, ] = await Promise.all([
          fix._player_create({ lname }),
          fix._player_create()
        ]);

        const query = {
          q: `${lname.substring(0,6)};lname`
        }

        const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

        const d = JSON.parse(body);
        expect(d).to.be.an('array').with.length(1);
        
        const _ids = d.map(({ pid }) => pid);
        expect(_ids).to.have.members([pid1]);
      });

      it('fname + lname', async () => {
        const fname = random_string(10);

        const [pid1, ] = await Promise.all([
          fix._player_create({ fname }),
          fix._player_create()
        ]);

        const query = {
          q: `${fname.substring(0,6)};fname,lname`
        }

        const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

        const d = JSON.parse(body);
        expect(d).to.be.an('array').with.length(1);
        
        const _ids = d.map(({ pid }) => pid);
        expect(_ids).to.have.members([pid1]);
      });

      it('fname + lname, no duplicate', async () => {
        const name = random_string(10);

        const [pid1, ] = await Promise.all([
          fix._player_create({ fname: name, lname: name}),
          fix._player_create()
        ]);

        const query = {
          q: `${name.substring(0,6)};fname,lname`
        }

        const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

        const d = JSON.parse(body);
        expect(d).to.be.an('array').with.length(1);
        
        const _ids = d.map(({ pid }) => pid);
        expect(_ids).to.have.members([pid1]);
      });
    });
    

    context('syntax', () => {
      it('url-encoded', async () => {
        const pre = 'a'
        const suf = random_string(9);
        const fname = `${pre}${suf}`;

        const [pid1,] = await Promise.all([
          fix._player_create({ fname }),
          fix._player_create()
        ]);

        const query = {
          q: `%${pre.charCodeAt(0).toString(16)}${suf};fname,lname`
        }

        const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

        const d = JSON.parse(body);
        expect(d).to.be.an('array').with.length(1);

        const _ids = d.map(({ pid }) => pid);
        expect(_ids).to.have.members([pid1]);
      });

      it('case insensitive', async () => {
        const fname = random_string(10);

        const [pid1, ] = await Promise.all([
          fix._player_create({ fname }),
          fix._player_create()
        ]);

        const query = {
          q: `${fname.toUpperCase()};fname`
        }

        const { body } = await fix.test_succeed(DEFAULT_METHOD, DEFAULT_PATH, { query }, 200);

        const d = JSON.parse(body);
        expect(d).to.be.an('array').with.length(1);
        
        const _ids = d.map(({ pid }) => pid);
        expect(_ids).to.have.members([pid1]);
      });
    });
  });
});
