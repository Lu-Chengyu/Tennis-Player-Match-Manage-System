'use strict';

const chai = require('chai');
const { expect } = chai;

const { Fixture } = require('../lib/fixture');
const fs = require('fs');
const path = require('path');

const { URL } = require('url');
const qs = require('querystring');

const { MongoClient, ObjectId } = require('mongodb');

const {
  random_string
} = require('../lib/util');

const INTERPRETER = 'node';
const SCRIPT_TO_TEST = `${__dirname}/../serverREST.js`;

const URL_MAP = {
  FRONT_PLAYER_CREATE: {
    method: 'GET',
    path: '/player/create.html'
  },
  FRONT_PLAYER_EDIT: {
    method: 'GET',
    path:   (pid) => `/player/${pid}/edit.html`
  },
  FRONT_PLAYER_LIST: {
    method: 'GET',
    path: '/players.html'
  },
  MATCH_AWARD: {
    method: 'POST',
    path:   (mid, pid) => `/api/match/${mid}/award/${pid}`
  },
  MATCH_CREATE: {
    method: 'POST',
    path:   '/api/match'
  },
  MATCH_DQ: {
    method: 'POST',
    path:   (mid, pid) => `/api/match/${mid}/disqualify/${pid}`
  },
  MATCH_END: {
    method: 'POST',
    path:   (mid) => `/api/match/${mid}/end`
  },
  MATCH_GET: {
    method: 'GET',
    path:   (mid) => `/api/match/${mid}`
  },
  MATCH_LIST: {
    method: 'GET',
    path:   `/api/match`
  },
  PING: {
    method: 'GET',
    path:   '/ping'
  },
  PLAYER_CREATE: {
    method: 'POST',
    path:   '/api/player'
  },
  PLAYER_DELETE: {
    method: 'DELETE',
    path:   (pid) => `/api/player/${pid}`
  },
  PLAYER_DEPOSIT: {
    method: 'POST',
    path:   (pid) => `/api/deposit/player/${pid}`
  },
  PLAYER_GET: {
    method: 'GET',
    path:   (pid) => `/api/player/${pid}`
  },
  PLAYER_LIST: {
    method: 'GET',
    path:   `/api/player`
  },
  PLAYER_UPDATE: {
    method: 'POST',
    path:   (pid) => `/api/player/${pid}`
  }
};

const WWW = {
  host:  'localhost',
  port:  '3000',
  proto: 'http'
};

const MONGO_CONNECTION = {
  host: process.env.MONGO_HOST || 'localhost',
  port: '27017',
  db:   'Tennis-Player-Match-Manage-System',
  opts: {
    useUnifiedTopology: true
  }
};

const MONGO_COLLECTION = {
  MATCH:  'match',
  PLAYER: 'player'
};


const HANDED_MAP = {
  A: 'ambi',
  L: 'left',
  R: 'right'
};

// player defaults
const DEFAULT_FNAME   = random_string();
const DEFAULT_LNAME   = random_string();
const DEFAULT_HANDED  = 'L';
const DEFAULT_INITIAL = 566;

// match defaults
const DEFAULT_ENTRY_FEE = 600;
const DEFAULT_PRIZE = 1000;


const MONGO_CONFIG_FILE = `${__dirname}/../config/mongo.json`;

class Hw6P2Fixture extends Fixture {
  constructor() {
    super(INTERPRETER, SCRIPT_TO_TEST);

    this.setWwwOpts(WWW);
  }

  static URL_MAP = URL_MAP;

  async _connect() {
    /*
    if (this._mongoConnect) {
      return;
    }
    */

    const { host, port, db, opts } = {
      ...MONGO_CONNECTION
    };

    const u = new URL(`mongodb://${host}:${port}`);
    u.search = qs.encode(opts);

    try {
      this._mongoConnect = await MongoClient.connect(u.href);
      this._mongoDb = this._mongoConnect.db(db);
    } catch(err) {
      console.error(`mongodb connection error -- ${err}`);
      process.exit(5);
    }
  }


  async _close() {
    if (this._mongoConnect) {
      return this._mongoConnect.close();
      this._mongoConnect = null;
    }
  }


  async before() {
    this.write_config();
    await this._connect();
    await this._db_flush();
    await super.before();
  }


  async after() {
    await super.after();
    await this._close();
  }


  // if rawData no output processing
  write_config(data = {}, rawData) {
    if (rawData === undefined) {
      data = {
        ...MONGO_CONNECTION,
        ...data
      };
      data = JSON.stringify(data);
    } else {
      data = rawData;
    }

    const dir = path.dirname(MONGO_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(MONGO_CONFIG_FILE, data);
  }


  _db_flush() {
    if (this._mongoDb) {
      return this._mongoDb.dropDatabase();
    }
  }


  random_id() {
    return random_string(24, false, 'abcdef0123456789');
  }


  // ENTITY HELPERS

  /*********************************************************
   * 
   * PLAYER
   *
   *********************************************************/
  
  // return obj, use params and replace missing with DEFAULT
  post_player_param(data) {
    const DEFAULT_DATA = {
      fname:                     DEFAULT_FNAME,
      lname:                     DEFAULT_LNAME,
      handed:                    HANDED_MAP[DEFAULT_HANDED],
      initial_balance_usd_cents: DEFAULT_INITIAL
    }

    return { ...DEFAULT_DATA, ...data };
  }


  // create player by request
  // return pid
  async post_player(params = {}) {
    const data = this.post_player_param(params);
    
    const { body } = await this.test_succeed(
      URL_MAP.PLAYER_CREATE.method,
      URL_MAP.PLAYER_CREATE.path,
      { data },
      200);
    
    const d = JSON.parse(body);
    expect(d).to.be.a.model('player');
    
    const { pid } = d;
    return pid;
  }
  

  // return obj, use params and replace missing with DEFAULT
  _player_create_defs(data) {
    const DEFAULT_DATA = {
      fname:             DEFAULT_FNAME,
      lname:             DEFAULT_LNAME,
      handed:            DEFAULT_HANDED,
      balance_usd_cents: DEFAULT_INITIAL,
      is_active:         true
    }

    return { ...DEFAULT_DATA, ...data };
  }


  // add player with data (defaults: _add_player_defs)
  // return pid
  async _player_create(data = {}) {
    const doc = this._player_create_defs(data);

    const { insertedId: _id } = await this._mongoDb.collection(MONGO_COLLECTION.PLAYER).insertOne(doc);

    return _id.toString();
  }


  _player_get(pid) {
    const selector = {
      _id: new ObjectId(pid)
    };

    return this._mongoDb.collection(MONGO_COLLECTION.PLAYER).findOne(selector);
  }


  async _player_list() {
    const docs = await this._mongoDb.collection(MONGO_COLLECTION.PLAYER).find({}, { projection: { _id: true } }).toArray();
    return docs.map(({ _id }) => _id.toString());
  }


  /*********************************************************
   * 
   * MATCH
   *
   *********************************************************/
  
  // return obj, use params and replace missing with DEFAULT
  post_match_param(data) {
    const DEFAULT_DATA = {
      entry_fee_usd_cents: DEFAULT_ENTRY_FEE,
      prize_usd_cents:     DEFAULT_PRIZE
    }

    return { ...DEFAULT_DATA, ...data };
  }


  // create match by request
  // return mid
  async post_match(params = {}) {
    const data = this.post_match_param(params);

    const { body } = await this.test_succeed(
      URL_MAP.MATCH_CREATE.method,
      URL_MAP.MATCH_CREATE.path,
      { data },
      200);
    
    const d = JSON.parse(body);
    expect(d).to.be.a.model('match');
    
    const { mid } = d;
    return mid;
  }


  async post_match_award(mid, pid, points = 1) {
    return this.test_succeed(
      URL_MAP.MATCH_AWARD.method,
      URL_MAP.MATCH_AWARD.path(mid, pid),
      { query: { points}},
      200);
  }


  async post_match_dq(mid, pid) {
    return this.test_succeed(
      URL_MAP.MATCH_DQ.method,
      URL_MAP.MATCH_DQ.path(mid, pid),
      {},
      200);
  }


  async post_match_end(mid) {
    return this.test_succeed(
      URL_MAP.MATCH_END.method,
      URL_MAP.MATCH_END.path(mid),
      {},
      200);
  }
  

  // return obj, use params and replace missing with DEFAULT
  _match_create_defs(data) {
    const DEFAULT_DATA = {
      created_at:          new Date(),
      entry_fee_usd_cents: DEFAULT_ENTRY_FEE,
      prize_usd_cents:     DEFAULT_PRIZE
    }

    return { ...DEFAULT_DATA, ...data };
  }


  // add match with data (defaults: _add_match_defs)
  // return mid
  async _match_create(data = {}) {
    const [p1_id, p2_id] = await Promise.all([
      'p1_id' in data ? data.p1_id : this._player_create(),
      'p2_id' in data ? data.p2_id : this._player_create()
    ]);

    Object.assign(data, {
      p1_id: new ObjectId(p1_id),
      p2_id: new ObjectId(p2_id)
    });

    const doc = this._match_create_defs(data);

    const { insertedId: _id } = await this._mongoDb.collection(MONGO_COLLECTION.MATCH).insertOne(doc);

    return { mid: _id.toString(), p1_id, p2_id };
  }


  // award points to pid in mid
  // only check that pid is in match, no check for is_active, etc.
  // TODO: remove
  async _match_award(mid, pid, points = 1) {
    const { p1_id, p2_id } = await this._match_get(mid);

    const IS_P1 = (pid === p1_id.toString());
    const IS_P2 = (pid === p2_id.toString());

    const selector = { mid: new ObjectId(mid) };
    const data = {};

    if (IS_P1) {
      data[p1_points] = points;
    }

    if (IS_P2) {
      data[p1_points] = points;
    }

    if (!(IS_P1 || IS_P2)) {
      console.error(`cannot award points to non participant player -- pid:${pid}, p1:${p1_id.toString()}, p2:${p2_id.toString()}`);
      return;
    }

    this._mongoDb.collection(MONGO_COLLECTION.MATCH).updateOne(selector, { $inc: data }, { upsert: false });
  }


  // end mid
  // do not check for active or winner, just update fields
  async _match_end() {
    const selector = { mid: new ObjectId(mid) };    
    data = {
      ended_at: new Date()
    };

    await this._mongoDb.collection(MONGO_COLLECTION.MATCH).updateOne(selector, { $set: data }, { upsert: false });
  }


  _match_get(mid) {
    const selector = {
      _id: new ObjectId(mid)
    };

    return this._mongoDb.collection(MONGO_COLLECTION.MATCH).findOne(selector);
  }


  async _match_list() {
    const docs = await this._mongoDb.collection(MONGO_COLLECTION.MATCH).find({}, { projection: { _id: true } }).toArray();
    return docs.map(({ _id }) => _id.toString());
  }


  /*********************************************************
   * 
   * ASSERTS (statics)
   *
   *********************************************************/


  static assert_valid_match(obj) {
    const fields = [
      'mid',
      'entry_fee_usd_cents',
      'p1_id',
      'p1_name',
      'p1_points',
      'p2_id',
      'p2_name',
      'p2_points',
      'winner_pid',
      'is_dq',
      'is_active',
      'prize_usd_cents',
      'age',
      'ended_at',
    ];

    for (const field of fields) {
      expect(obj).to.have.property(field);
    }
  }


  static assert_valid_match_document(obj) {
    const fields = [
      '_id',
      'entry_fee_usd_cents',
      'p1_id',
      'p2_id',
      'prize_usd_cents'
    ];

    for (const field of fields) {
      expect(obj).to.have.property(field);
    }
  }


  static assert_valid_player(obj) {
    const fields = [
      'pid',
      'name',
      'handed',
      'is_active',
      'num_join',
      'num_won',
      'num_dq',
      'balance_usd_cents',
      'total_points',
      'total_prize_usd_cents',
      'efficiency',
      'in_active_match',
    ];

    for (const field of fields) {
      expect(obj).to.have.property(field);
    }
  }


  static assert_valid_player_document(obj) {
    const fields = [
      '_id',
      'fname',
      'lname',
      'handed',
      'is_active',
      'balance_usd_cents'
    ];

    for (const field of fields) {
      expect(obj).to.have.property(field);
    }
  }


  static assert_valid_player_balance(obj) {
    const fields = [
      'old_balance_usd_cents',
      'new_balance_usd_cents'
    ];

    for (const field of fields) {
      expect(obj).to.have.property(field);
    }
  }
}


chai.use(function (chai) {
  var Assertion = chai.Assertion;

  Assertion.addMethod('document', function (exp) {
    const self = this;

    const validators = {
      match:  Hw6P2Fixture.assert_valid_match_document,
      player: Hw6P2Fixture.assert_valid_player_document
    }

    if (!(exp in validators)) {
      throw new Error(`invalid document assertion -- val:${exp}, allowed:${Object.keys(validators).join(',')}`);
    }

    validators[exp](self._obj);
  });

  Assertion.addMethod('model', function (exp) {
    const self = this;

    const validators = {
      match:          Hw6P2Fixture.assert_valid_match,
      player:         Hw6P2Fixture.assert_valid_player,
      player_balance: Hw6P2Fixture.assert_valid_player_balance
    }

    if (!(exp in validators)) {
      throw new Error(`invalid model assertion -- val:${exp}, allowed:${Object.keys(validators).join(',')}`);
    }

    validators[exp](self._obj);
  });
});

module.exports = {
  Fixture: Hw6P2Fixture
}
