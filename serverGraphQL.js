const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");
const { exit } = require("process");
const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const {
  assertResolversPresent,
  makeExecutableSchema,
} = require("@graphql-tools/schema");
let PORT = 3000;
const HOSTNAME = "localhost";
const MONGODBCONFIG = path.join(__dirname, "./config/mongo.json");

const app = express();
app.set("views", `${__dirname}/views`);
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
const util = require("util");
const { find } = require("lodash");
// const { buildSchema } = require("graphql");

const handedURL2Data = {
  left: "L",
  right: "R",
  ambi: "A",
};

const handedData2URL = {
  L: "left",
  R: "right",
  A: "ambi",
};

class Database {
  constructor(filePath) {
    let defaultConfig = {
      host: "localhost",
      port: "27017",
      db: "ee547_hw",
      opts: {
        useUnifiedTopology: true,
      },
    };

    try {
      this.config = require(filePath);
    } catch {
      process.exit(2);
    }
    this.config = this.config || defaultConfig;
    this.player = "player";
    this.match = "match";
    this.client = new MongoClient(
      `mongodb://${this.config.host}:${this.config.port}`,
      this.config.opts
    );
    this.db = this.client.db(this.config.db);
  }

  async getPlayer(pid) {
    let result;
    try {
      result = await this.db
        .collection(this.player)
        .findOne({ _id: ObjectId(pid) });
      if (!result) {
        throw new Error();
      }
    } finally {
    }
    return await this.normalizedPlayer(result);
  }

  async getPlayers() {
    let result;
    try {
      result = await this.db.collection(this.player).find({}).toArray();
      result = await this.normalizedPlayer(result);
      result.sort((a, b) => {
        if (a.name < b.name) {
          return -1;
        }
        if (a.name > b.name) {
          return 1;
        }
        return 0;
      });
    } finally {
    }
    return result;
  }

  async getSomePlayers(is_active) {
    let result;
    try {
      if (is_active == "true") {
        result = await this.db
          .collection(this.player)
          .find({ is_active: { $eq: true } })
          .toArray();
      } else if (is_active == "false") {
        result = await this.db
          .collection(this.player)
          .find({ is_active: { $eq: false } })
          .toArray();
      }
      result = await this.normalizedPlayer(result);
      result.sort((a, b) => {
        if (a.name < b.name) {
          return -1;
        }
        if (a.name > b.name) {
          return 1;
        }
        return 0;
      });
    } finally {
    }
    return result;
  }

  async getNamePlayers(name, vars) {
    let result;
    try {
      if (vars == "fname") {
        result = await this.db
          .collection(this.player)
          .find({ fname: new RegExp(".*" + name + ".*", "i") })
          .toArray();
      } else if (vars == "lname") {
        result = await this.db
          .collection(this.player)
          .find({ lname: new RegExp(".*" + name + ".*", "i") })
          .toArray();
      } else if (vars == "fname,lname") {
        result = await this.db
          .collection(this.player)
          .find({
            $or: [
              { fname: new RegExp(".*" + name + ".*", "i") },
              { lname: new RegExp(".*" + name + ".*", "i") },
            ],
          })
          .toArray();
      }
      result = await this.normalizedPlayer(result);
      result.sort((a, b) => {
        if (a.name < b.name) {
          return -1;
        }
        if (a.name > b.name) {
          return 1;
        }
        return 0;
      });
    } finally {
    }
    return result;
  }

  async createPlayer(fname, lname, handed, initial_balance_usd_cents) {
    let result;
    let player = {
      balance_usd_cents: initial_balance_usd_cents,
      created_at: new Date(),
      fname: fname,
      lname: lname,
      handed: handed,
      is_active: true,
    };
    try {
      result = await this.db.collection(this.player).insertOne(player);
    } finally {
    }
    return this.getPlayer(result.insertedId);
  }

  async updatePlayer(pid, lname, is_active) {
    let updated = false;
    let result;
    let update_dict = { $set: {} };
    if (lname != null) {
      update_dict.$set.lname = lname;
    }
    if (is_active != null) {
      update_dict.$set.is_active = is_active;
    }
    try {
      result = await this.db
        .collection(this.player)
        .updateOne({ _id: ObjectId(pid) }, update_dict);
      if (result.matchedCount > 0) {
        updated = true;
      } else {
        throw new Error();
      }
    } finally {
    }
    return this.getPlayer(pid);
  }

  async deletePlayer(pid) {
    let deleted = false;
    let result;
    try {
      result = await this.db
        .collection(this.player)
        .deleteOne({ _id: ObjectId(pid) });
      if (!result) {
        throw new Error();
      } else if (result.deletedCount > 0) {
        deleted = true;
      } else {
        throw new Error();
      }
    } finally {
    }
    return deleted;
  }

  async getBalance(pid, deposit_value) {
    let result;
    let player;
    let return_dict;
    let update_dict = { $inc: { balance_usd_cents: deposit_value } };
    try {
      player = await this.db
        .collection(this.player)
        .findOne({ _id: ObjectId(pid) });
      return_dict = {
        old_balance_usd_cents: player?.balance_usd_cents,
        new_balance_usd_cents: null,
      };
      if (player) {
        result = await this.db
          .collection(this.player)
          .updateOne({ _id: ObjectId(pid) }, update_dict);
        if (result.matchedCount > 0) {
          return_dict.new_balance_usd_cents =
            update_dict.$inc.balance_usd_cents + player?.balance_usd_cents;
        }
      } else {
        throw new Error();
      }
    } finally {
    }
    return this.getPlayer(pid);
  }

  async normalizedPlayer(player) {
    if (player == null) {
      return null;
    }
    if (Array.isArray(player)) {
      return await Promise.all(player.map(this.normalizedPlayer, this));
    } else {
      let return_dict = {
        pid: player._id,
        fname: `${player.fname ? `${player.fname}` : ""}`,
        lname: `${player.lname ? `${player.lname}` : ""}`,
        name: `${player.fname}${player.lname ? ` ${player.lname}` : ""}`,
        handed: handedData2URL[player.handed],
        is_active: player.is_active,
        num_join: 0,
        num_won: 0,
        num_dq: 0,
        balance_usd_cents: player.balance_usd_cents,
        total_points: 0,
        total_prize_usd_cents: 0,
        efficiency: 0,
        in_active_match: null,
      };
      try {
        return_dict.num_join = await this.db
          .collection(this.match)
          .count({ $or: [{ p1_id: player._id }, { p2_id: player._id }] });
        return_dict.num_dq = await this.db
          .collection(this.match)
          .count({ dq_p: player._id });
        return_dict.total_points =
          (await this.db
            .collection(this.match)
            .aggregate([{ $match: { p1_id: player._id } }], {
              $group: { _id: null, sum: { $sum: "$p1_points" } },
            }).sum) ?? 0;
        return_dict.total_points +=
          (await this.db
            .collection(this.match)
            .aggregate([{ $match: { p2_id: player._id } }], {
              $group: { _id: null, sum: { $sum: "$p2_points" } },
            }).sum) ?? 0;
        return_dict.num_won = await this.db.collection(this.match).count({
          $or: [
            {
              p1_id: player._id,
              dq_p: { $ne: player._id },
              ended_at: { $ne: null },
              $expr: { $gt: ["$p1_points", "p2_points"] },
            },
            {
              p2_id: player._id,
              dq_p: { $ne: player._id },
              ended_at: { $ne: null },
              $expr: { $gt: ["$p2_points", "p1_points"] },
            },
          ],
        });
        return_dict.total_prize_usd_cents =
          (await this.db.collection(this.match).aggregate(
            [
              {
                $match: {
                  $or: [
                    {
                      p1_id: player._id,
                      dq_p: { $ne: player._id },
                      ended_at: { $ne: null },
                      $expr: { $gt: ["$p1_points", "p2_points"] },
                    },
                    {
                      p2_id: player._id,
                      dq_p: { $ne: player._id },
                      ended_at: { $ne: null },
                      $expr: { $gt: ["$p2_points", "p1_points"] },
                    },
                  ],
                },
              },
            ],
            { $group: { _id: null, sum: { $sum: "$prize_usd_cents" } } }
          ).sum) ?? return_dict.total_prize_usd_cents;
        return_dict.efficiency =
          return_dict.num_join === 0
            ? 0
            : return_dict.num_won / return_dict.num_join;
        let temp = await this.db.collection(this.match).findOne({
          $or: [
            { p1_id: player._id.toString(), ended_at: null },
            { p2_id: player._id.toString(), ended_at: null },
          ],
        });
        return_dict.in_active_match = temp ? temp._id : null;
      } finally {
      }
      return return_dict;
    }
  }

  async createMatch(p1_id, p2_id, entry_fee_usd_cents, prize_usd_cents) {
    let result;
    let match = {
      created_at: new Date(),
      ended_at: null,
      entry_fee_usd_cents: entry_fee_usd_cents,
      is_dq: false,
      dq_p: null,
      p1_id: p1_id,
      p1_points: 0,
      p2_id: p2_id,
      p2_points: 0,
      prize_usd_cents: prize_usd_cents,
    };
    try {
      result = await this.db.collection(this.match).insertOne(match);
      let update_dict = { $inc: { balance_usd_cents: -entry_fee_usd_cents } };
      await this.db
        .collection(this.player)
        .updateOne({ _id: ObjectId(p1_id) }, update_dict);
      await this.db
        .collection(this.player)
        .updateOne({ _id: ObjectId(p2_id) }, update_dict);
      result = await this.db
        .collection(this.match)
        .findOne({ _id: result.insertedId });
    } finally {
    }
    return await this.normalizedMatch(result);
  }

  async getMatch(mid) {
    let result;
    try {
      result = await this.db
        .collection(this.match)
        .findOne({ _id: ObjectId(mid) });
      if (!result) {
        throw new Error();
      }
    } finally {
    }
    return await this.normalizedMatch(result);
  }

  getWinner_pid(match) {
    if (match.dq_p === match.p1_id) {
      return match.p2_id;
    } else if (match.dq_p === match.p2_id) {
      return match.p1_id;
    } else if (match.p1_points > match.p2_points) {
      return match.p1_id;
    } else if (match.p1_points < match.p2_points) {
      return match.p2_id;
    } else {
      return null;
    }
  }

  async getMatches() {
    let result;
    try {
      //this.db.dropDatabase()
      result = await this.db.collection(this.match).find({}).toArray();
      result = await this.normalizedMatch(result);
      result.sort((a, b) => {
        if (a.prize_usd_cents > b.prize_usd_cents) {
          return -1;
        }
        if (a.prize_usd_cents < b.prize_usd_cents) {
          return 1;
        }
        return 0;
      });
    } finally {
    }
    return result;
  }

  async getSomeMatches(is_active) {
    let result;
    try {
      if (is_active == "true") {
        result = await this.db
          .collection(this.match)
          .find({ ended_at: { $exists: false } })
          .toArray();
      } else if (is_active == "false") {
        result = await this.db
          .collection(this.match)
          .find({ ended_at: { $exists: true } })
          .toArray();
      }
      result = await this.normalizedMatch(result);
      result.sort((a, b) => {
        if (a.prize_usd_cents < b.prize_usd_cents) {
          return 1;
        }
        if (a.prize_usd_cents > b.prize_usd_cents) {
          return -1;
        }
        return 0;
      });
    } finally {
    }
    return result;
  }

  async normalizedMatch(match) {
    if (match == null) {
      return null;
    }
    if (Array.isArray(match)) {
      return await Promise.all(match.map(this.normalizedMatch, this));
    } else {
      let p1 = await this.db
        .collection(this.player)
        .findOne({ _id: ObjectId(match.p1_id) });
      let p2 = await this.db
        .collection(this.player)
        .findOne({ _id: ObjectId(match.p2_id) });
      let age = match.ended_at
        ? (match.ended_at - match.created_at) / 1000
        : (new Date() - match.created_at) / 1000;
      age = Math.round(age);

      //   let p1_ = await this.getPlayer(match.p1_id);
      //   let p2_ = await this.getPlayer(match.p2_id);
      let return_dict = {
        mid: match._id,
        entry_fee_usd_cents: match.entry_fee_usd_cents,
        p1_id: match.p1_id.toString(),
        // p1_id: p1_,
        p1_name: `${p1.fname}${p1.lname ? ` ${p1.lname}` : ""}`,
        p1_points: match.p1_points === undefined ? 0 : match.p1_points,
        p2_id: match.p2_id.toString(),
        // p2_id: p2_,
        p2_name: `${p2.fname}${p2.lname ? ` ${p2.lname}` : ""}`,
        p2_points: match.p2_points === undefined ? 0 : match.p2_points,
        winner_pid: this.getWinner_pid(match),
        is_dq: match.is_dq === undefined ? false : match.is_dq,
        is_active: match.ended_at ? false : true,
        prize_usd_cents: match.prize_usd_cents,
        age: age,
        ended_at: match.ended_at === undefined ? null : match.ended_at,
      };
      return return_dict;
    }
  }

  getWinner_pid(match) {
    let is_active = match.ended_at ? false : true;
    let p1_points = match.p1_points === undefined ? 0 : match.p1_points;
    let p2_points = match.p2_points === undefined ? 0 : match.p1_points;
    let is_dq = match.is_dq === undefined ? false : match.is_dq;
    let dq_p = match.dq_p === undefined ? null : match.dq_p;
    if (is_active) {
      return null;
    }
    if ((p1_points > p2_points && is_dq == false) || dq_p == match.p2_id) {
      return match.p1_id;
    }
    if ((p2_points > p1_points && is_dq == false) || dq_p == match.p1_id) {
      return match.p2_id;
    }
    return null;
  }

  async addPoints(mid, index, points) {
    let result;
    try {
      let update_dict =
        index === 1
          ? { $inc: { p1_points: points } }
          : { $inc: { p2_points: points } };
      await this.db
        .collection(this.match)
        .updateOne({ _id: ObjectId(mid) }, update_dict);
      result = await this.db
        .collection(this.match)
        .findOne({ _id: ObjectId(mid) });
    } finally {
    }
    return await this.normalizedMatch(result);
  }

  async endMatch(mid) {
    let result;
    try {
      let update_dict_match = { $set: {} };
      update_dict_match.$set.ended_at = new Date();
      await this.db
        .collection(this.match)
        .updateOne({ _id: ObjectId(mid) }, update_dict_match);
      result = await this.db
        .collection(this.match)
        .findOne({ _id: ObjectId(mid) });
      let p1_points = result.p1_points === undefined ? 0 : result.p1_points;
      let p2_points = result.p2_points === undefined ? 0 : result.p2_points;
      let winner_pid = p2_points > p1_points ? result.p2_id : result.p1_id;
      let update_dict_player = {
        $inc: { balance_usd_cents: result.prize_usd_cents },
      };
      await this.db
        .collection(this.player)
        .updateOne({ _id: ObjectId(winner_pid) }, update_dict_player);
    } finally {
    }
    return await this.normalizedMatch(result);
  }

  async dqPlayer(mid, pid) {
    let result;
    try {
      let update_dict_match = { $set: {} };
      update_dict_match.$set.ended_at = new Date();
      update_dict_match.$set.is_dq = true;
      update_dict_match.$set.dq_p = pid;
      await this.db
        .collection(this.match)
        .updateOne({ _id: ObjectId(mid) }, update_dict_match);
      result = await this.db
        .collection(this.match)
        .findOne({ _id: ObjectId(mid) });
      let winner_pid =
        pid === result.p1_id.toString() ? result.p2_id : result.p1_id;
      let update_dict_player = {
        $inc: { balance_usd_cents: result.prize_usd_cents },
      };
      await this.db
        .collection(this.player)
        .updateOne({ _id: ObjectId(winner_pid) }, update_dict_player);
    } finally {
    }
    return await this.normalizedMatch(result);
  }

  async getDashboard() {
    let result = {
      total_num: 0,
      num_active: 0,
      num_inactive: 0,
      avg_balance: 0,
    };
    try {
      result.total_num = await this.db.collection(this.player).countDocuments();
      result.num_active = await this.db
        .collection(this.player)
        .countDocuments({ is_active: true });
      result.num_inactive = await this.db
        .collection(this.player)
        .countDocuments({ is_active: false });
      //result.avg_balance = await this.db.collection(this.player).aggregate([{ $match: {} }], { $group: { _id: null, sum: { $sum: "$balance_usd_cents" } } }).sum ?? 0
      // let a =  await this.db.collection(this.player).aggregate([{ $match: {'is_active': true} }], { $group: { _id: null, sum: { $sum: "$balance_usd_cents" } } })
      let temp = await this.db.collection(this.player).find({}).toArray();
      let sum = 0;
      temp.forEach((d) => {
        sum += d.balance_usd_cents;
      });
      result.avg_balance = result.total_num !== 0 ? sum / result.total_num : 0;
    } finally {
    }
    return result;
  }
}

let DB = new Database(MONGODBCONFIG);

const typeDefs = `
type Query {
    player(pid: ID!): Player
  
    players(
      is_active: Boolean
      q: String
    ): [Player]!
  
    match(mid: ID!): Match
  
    matches(
      is_active: Boolean
    ): [Match]!
  
    dashboard: Dashboard
  }
  
  type Mutation {
    matchAward(mid: ID!, pid: ID!, points: Int!): Match
  
    matchCreate(
      pid1: ID!
      pid2: ID!
      entry_fee_usd_cents: Int!
      prize_usd_cents: Int!
    ): Match
  
    matchDisqualify(mid: ID!, pid: ID!): Match
  
    matchEnd(mid: ID!): Match
  
    playerCreate(playerInput: PlayerCreateInput): Player
  
    playerDelete(pid: ID!): Boolean
  
    playerDeposit(pid: ID!, amount_usd_cents: Int!): Player
  
    playerUpdate(pid: ID!, playerInput: PlayerUpdateInput): Player
  }
  
  enum HandedEnum {
    ambi
    left
    right
  }
  
  input PlayerCreateInput {
    fname: String!
    handed: HandedEnum
    initial_balance_usd_cents: Int!
    lname: String
  }
  
  input PlayerUpdateInput {
    is_active: Boolean
    lname: String
  }
  
  type Player {
    balance_usd_cents: Int
    efficiency: Float
    fname: String
    handed: HandedEnum
    in_active_match: Match
    is_active: Boolean
    lname: String
    name: String
    num_dq: Int
    num_join: Int
    num_won: Int
    pid: ID!
    total_points: Int
    total_prize_usd_cents: Int
  }
  
  type Match {
    age: Int
    ended_at: String
    entry_fee_usd_cents: Int
    is_active: Boolean
    is_dq: Boolean
    mid: ID!
    p1: Player!
    p1_points: Int
    p2: Player!
    p2_points: Int
    prize_usd_cents: Int
    winner: Player
  }
  
  type Dashboard {
    player: DashboardPlayer
  }
  
  type DashboardPlayer {
    avg_balance_usd_cents: Int
    num_active: Int
    num_inactive: Int
    num_total: Int
  }
  
`;

const resolvers = {
  Mutation: {
    playerUpdate: async (obj, { pid, playerInput }, DB) => {
      let error = false;
      let lname = playerInput.lname ?? null;
      let is_active = playerInput.is_active ?? null;
      try {
        p1 = await DB.getPlayer(pid);
      } catch (err) {
        return null;
      }
      if (
        is_active != undefined &&
        ["1", "true", "t"].includes(is_active.toString().toLowerCase())
      ) {
        is_active = true;
      } else {
        is_active = false;
      }
      // if (lname == undefined || (!!lname && !/(^[a-zA-Z]+$)*/.test(lname))) {
      //   error = true;
      // }
      try {
        return await DB.updatePlayer(pid, lname, is_active);
      } catch (err) {
        throw err;
      }
    },
    playerDelete: async (obj, { pid }, DB) => {
      await DB.deletePlayer(pid).catch((err) => {
        throw err;
      });
      return true;
    },
    playerDeposit: async (obj, { pid, amount_usd_cents }, DB) => {
      let deposit_value = amount_usd_cents;
      if (
        isNaN(Number(deposit_value)) ||
        Number(deposit_value) <= 0 ||
        !Number.isInteger(Number(deposit_value))
      ) {
        throw new Error();
      }
      try {
        return await DB.getBalance(pid, Number(deposit_value));
      } catch (err) {
        throw err;
      }
    },
    playerCreate: async (obj, { playerInput }, DB) => {
      let error = false;
      let fname = playerInput.fname;
      let lname = playerInput.lname;
      let resBody = "invalid_fields: ";
      let handed = playerInput.handed;
      let initial_balance_usd_cents = playerInput.initial_balance_usd_cents;
      if (fname == undefined || !/^[a-zA-Z]+$/.test(fname)) {
        resBody += "fname";
        error = true;
      }
      if (lname == undefined || (!!lname && !/^[a-zA-Z]*$/.test(lname))) {
        resBody += "lname";
        error = true;
      }
      if (
        handed == undefined ||
        !["left", "right", "ambi"].includes(handed.toLowerCase())
      ) {
        resBody += "handed";
        error = true;
      }
      if (
        initial_balance_usd_cents == undefined ||
        isNaN(Number(initial_balance_usd_cents)) ||
        Number(initial_balance_usd_cents) < 0 ||
        !Number.isInteger(Number(initial_balance_usd_cents))
      ) {
        resBody += "balance_usd_cents";
        error = true;
      }
      if (!error) {
        let player = await DB.createPlayer(
          fname,
          lname,
          handedURL2Data[handed.toLowerCase()],
          Number(initial_balance_usd_cents)
        );
        return player;
      } else {
        throw new Error();
      }
    },
    matchCreate: async (
      obj,
      { pid1, pid2, entry_fee_usd_cents, prize_usd_cents },
      DB
    ) => {
      let p1_id = pid1;
      let p2_id = pid2;
      let p1;
      let p2;

      try {
        p1 = await DB.getPlayer(p1_id);
        p2 = await DB.getPlayer(p2_id);
      } catch (err) {
        throw err;
      }

      if (p1.in_active_match != null || p2.in_active_match != null) {
        throw new Error();
      }
      if (
        p1.balance_usd_cents < Number(entry_fee_usd_cents) ||
        p2.balance_usd_cents < Number(entry_fee_usd_cents)
      ) {
        throw new Error();
      }
      if (
        isNaN(Number(entry_fee_usd_cents)) ||
        Number(entry_fee_usd_cents) < 0 ||
        !Number.isInteger(Number(entry_fee_usd_cents))
      ) {
        throw new Error();
      }
      if (
        isNaN(Number(prize_usd_cents)) ||
        Number(prize_usd_cents) < 0 ||
        !Number.isInteger(Number(prize_usd_cents))
      ) {
        throw new Error();
      }
      try {
        return await DB.createMatch(
          p1_id,
          p2_id,
          Number(entry_fee_usd_cents),
          Number(prize_usd_cents)
        );
      } catch (err) {
        throw err;
      }
    },
    matchAward: async (obj, { mid, pid, points }, DB) => {
      let player;
      let match;
      let index;
      try {
        match = await DB.getMatch(mid);
        player = await DB.getPlayer(pid);
      } catch (err) {
        throw err;
      }
      if (!match.is_active) {
        throw new Error();
      }
      if (
        player.pid.toString() !== match.p1_id.toString() &&
        player.pid.toString() !== match.p2_id.toString()
      ) {
        throw new Error();
      }
      if (!player.is_active) {
        throw new Error();
      }
      if (
        isNaN(Number(points)) ||
        Number(points) <= 0 ||
        !Number.isInteger(Number(points)) ||
        points.toString().indexOf(".") != -1
      ) {
        throw new Error();
      }
      index = pid === match.p1_id.toString() ? 1 : 2;
      try {
        return await DB.addPoints(mid, index, Number(points));
      } catch (err) {
        throw err;
      }
    },
    matchDisqualify: async (obj, { mid, pid }, DB) => {
      let match;
      let player;
      try {
        match = await DB.getMatch(mid);
        player = await DB.getPlayer(pid);
      } catch (err) {
        throw err;
      }
      if (!match.is_active) {
        throw new Error();
      }
      if (
        player.pid.toString() !== match.p1_id.toString() &&
        player.pid.toString() !== match.p2_id.toString()
      ) {
        throw new Error();
      }
      if (!player.is_active) {
        throw new Error();
      }
      try {
        return await DB.dqPlayer(mid, pid);
      } catch (err) {
        throw new Error();
      }
    },

    matchEnd: async (obj, { mid }, DB) => {
      let match;
      try {
        match = await DB.getMatch(mid);
      } catch (err) {
        throw err;
      }
      if (!match.is_active || match.p1_points === match.p2_points) {
        throw new Error();
      }
      return await DB.endMatch(mid);
    },
  },

  Query: {
    player: async ({}, { pid }, DB) => {
      return await DB.getPlayer(pid);
    },

    players: async ({}, { is_active, q }, DB) => {
      if (q !== undefined) {
        let name = decodeURIComponent(q.split(";")[0]);
        var vars = q.split(";")[1] || "fname,lname";
        return await DB.getNamePlayers(name, vars);
      }
      if (is_active == undefined || is_active == "*") {
        return await DB.getPlayers();
      } else {
        return DB.getSomePlayers(is_active);
      }
    },

    match: async (obj, { mid }, DB) => {
      return await DB.getMatch(mid);
    },

    matches: async (obj, { is_active, q }, DB) => {
      let is_active_1 = is_active || "true";
      if (is_active_1 === "*") {
        return await DB.getMatches();
      } else {
        return await DB.getSomeMatches(is_active_1);
      }
    },

    dashboard: async (obj, {}, DB) => {
      try {
        return await DB.getDashboard();
      } catch (err) {
        throw err;
      }
    },
  },
};

// (async function () {
//   const DB = require("./mongo");
//   const typeDefs = fs.readFileSync("./schema.graphql").toString("utf-8");
//   const resolvers = require("./resolvers");
const schema = makeExecutableSchema({
  resolvers,
  resolverValidationOptions: {
    requireResolversForAllFields: "warn",
    requireResolversToMatchSchema: "warn",
  },
  typeDefs,
});
app.use(
  "/graphql",
  graphqlHTTP(async (req) => {
    return {
      schema,
      graphiql: true,
      context: DB,
    };
  })
);
app.get("/ping", (req, res) => {
  res.sendStatus(204);
});
app.listen(3000);
console.log("GraphQL API server running at http://localhost:3000/graphql");
// })();
