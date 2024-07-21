'use strict';

const { assert, expect } = require('chai');

const fs = require('fs');

const DEFAULT_TIMEOUT_MS = 4e3;
const { Fixture } = require('./fixture_serverREST');

const {
  random_string
} = require('../lib/util');


describe('fronend: player edit', function () {
  const DEFAULT_PATH   = Fixture.URL_MAP.FRONT_PLAYER_EDIT.path;
  const DEFAULT_METHOD = Fixture.URL_MAP.FRONT_PLAYER_EDIT.method;

  this.timeout(DEFAULT_TIMEOUT_MS);

  const fix = new Fixture();

  before(() => fix.before());
  after(() => fix.after());

  context('express', () => {
    it('route exists', async () => {
      const pid = await fix._player_create();
      
      const url = fix.url(DEFAULT_PATH(pid));
      const { body, status, headers } = await fix.request(DEFAULT_METHOD, url);
      
      expect(status).to.be.equal(200);
    });

    it('response code is 200', async () => {
      const pid = await fix._player_create();
      
      const url = fix.url(DEFAULT_PATH(pid));
      const { body, status, headers } = await fix.request(DEFAULT_METHOD, url);
      
      expect(status).to.be.equal(200);
    });

    it('response header, Content-Type = text/html', async () => {
      const pid = await fix._player_create();
      
      const url = fix.url(DEFAULT_PATH(pid));
      const { headers } = await fix.request(DEFAULT_METHOD, url);

      const contentType = fix.getPropertyCaseInsensitive(headers, 'content-type');
      expect(contentType)
        .to.be.a('string')
        .and.satisfy(s => s.startsWith('text/html'), `${contentType} does not match text/html`);
    });
  });


  context('page source', () => {
    it('is valid html', async () => {
      const pid = await fix._player_create();

      const url = fix.url(DEFAULT_PATH(pid));
      const { body } = await fix.request(DEFAULT_METHOD, url);
      
      fix.requireValidHtml(body);
    });
  });
});
