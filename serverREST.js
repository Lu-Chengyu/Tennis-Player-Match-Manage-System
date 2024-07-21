const path = require('path')
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

let PORT = 3000;
const HOSTNAME = 'localhost';
const MONGODBCONFIG = path.join(__dirname, './config/mongo.json')

const app = express()
app.set('views', `${__dirname}/views`)
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
const util = require('util');


const handedURL2Data = {
    'left': 'L',
    'right': 'R',
    'ambi': 'A'
}

const handedData2URL = {
    'L': 'left',
    'R': 'right',
    'A': 'ambi'
}

class Database {
    constructor(filePath) {
        let defaultConfig = {
            "host": "localhost",
            "port": "27017",
            "db": "Tennis-Player-Match-Manage-System",
        }
        try {
            this.config = require(filePath)
        }
        catch(error) {
            console.error(`Failed to load config from ${filePath}:`, error.message);
            this.config = defaultConfig;
        }
        this.config = this.config || defaultConfig
        this.player = 'player'
        this.match = 'match'
        this.client = new MongoClient(`mongodb://${this.config.host}:${this.config.port}`);
        this.db = this.client.db(this.config.db)
    }

    async getPlayer(pid) {
        let result;
        try {
            result = await this.db.collection(this.player).findOne({ '_id': ObjectId(pid) })
            result = await this.normalizedPlayer(result)
        }
        finally { }
        return result
    }

    async getPlayers() {
        let result;
        try {
            result = await this.db.collection(this.player).find({}).toArray()
            result = await this.normalizedPlayer(result)
            result.sort((a, b) => {
                if (a.name < b.name) {
                    return -1
                }
                else if (a.name > b.name) {
                    return 1
                }
                return 0
            })
        }
        finally { }
        return result
    }

    async getSomePlayers(is_active) {
        let result;
        try {
            if (is_active == "true") {
                result = await this.db.collection(this.player).find({ "is_active": { $eq: true } }).toArray()
            }
            else{
                result = await this.db.collection(this.player).find({ "is_active": { $eq: false } }).toArray()
            }
            result = await this.normalizedPlayer(result)
            result.sort((a, b) => {
                if (a.name < b.name) {
                    return -1
                }
                else if (a.name > b.name) {
                    return 1
                }
                return 0
            })
        }
        finally { }
        return result
    }

    async getNamePlayers(name, vars) {
        let result;
        try {
            if (vars == "fname") {
                result = await this.db.collection(this.player).find({ "fname": new RegExp('.*' + name + '.*','i') }).toArray()
            }
            else if (vars == "lname") {
                result = await this.db.collection(this.player).find({ "lname": new RegExp('.*' + name + '.*','i') }).toArray()
            }
            else if(vars == "fname,lname"){
                result = await this.db.collection(this.player).find({ $or: [ {  "fname": new RegExp('.*' + name + '.*','i')  }, { "lname": new RegExp('.*' + name + '.*','i') } ] }).toArray()
            }
            result = await this.normalizedPlayer(result)
            result.sort((a, b) => {
                if (a.name < b.name) {
                    return -1
                }
                else if (a.name > b.name) {
                    return 1
                }
                return 0
            })
        }
        finally { }
        return result
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
        }
        try {
            result = await this.db.collection(this.player).insertOne(player)
        }
        finally { }
        return await this.getPlayer(result.insertedId)
    }

    async updatePlayer(pid, lname, is_active) {
        let updated = false
        let result;
        let update_dict = { $set: {} }
        if (lname != null) {
            update_dict.$set.lname = lname
        }
        if (is_active != null) {
            update_dict.$set.is_active = is_active
        }
        try {
            result = await this.db.collection(this.player).updateOne({ '_id': ObjectId(pid) }, update_dict)
            if (result.matchedCount > 0) {
                updated = true
            }
            else {
                throw new Error()
            }
        }
        finally { }
        return await this.getPlayer(pid)
    }

    async deletePlayer(pid) {
        let deleted = false
        let result;
        try {
            result = await this.db.collection(this.player).deleteOne({ '_id': ObjectId(pid) })
            if (!result) {
                throw new Error()
            }
            else if (result.deletedCount > 0) {
                deleted = true
            }
            else {
                throw new Error()
            }
        }
        finally { }
        return deleted
    }

    async getBalance(pid, deposit_value) {
        let result;
        let player;
        let return_dict;
        let update_dict = { $inc: { balance_usd_cents: deposit_value } }
        try {
            player = await this.db.collection(this.player).findOne({ '_id': ObjectId(pid) })
            return_dict = {
                'old_balance_usd_cents': player?.balance_usd_cents,
                'new_balance_usd_cents': null
            }
            if (player) {
                result = await this.db.collection(this.player).updateOne({ '_id': ObjectId(pid) }, update_dict)
                if (result.matchedCount > 0) {
                    return_dict.new_balance_usd_cents = update_dict.$inc.balance_usd_cents + player?.balance_usd_cents
                }
            }
            else {
                throw new Error()
            }
        }
        finally { }
        return return_dict
    }

    async normalizedPlayer(player) {
        if (player == null) {
            return null
        }
        if (Array.isArray(player)) {
            return await Promise.all(player.map(this.normalizedPlayer, this))
        }
        else {
            let return_dict = {
                pid: player._id,
                name: `${player.fname}${player.lname ? ` ${player.lname}` : ''}`,
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
            }
            try {
                return_dict.num_join = await this.db.collection(this.match).count({ $or: [{ 'p1_id': player._id }, { 'p2_id': player._id }] })
                return_dict.num_dq = await this.db.collection(this.match).count({ 'dq_p': player._id })
                return_dict.total_points = await this.db.collection(this.match).aggregate([{ $match: { 'p1_id': player._id } }], { $group: { _id: null, sum: { $sum: "$p1_points" } } }).sum ?? 0
                return_dict.total_points += await this.db.collection(this.match).aggregate([{ $match: { 'p2_id': player._id } }], { $group: { _id: null, sum: { $sum: "$p2_points" } } }).sum ?? 0
                return_dict.num_won = await this.db.collection(this.match).count({ $or: [{ 'p1_id': player._id, 'dq_p': { $ne: player._id }, 'ended_at': { $ne: null }, $expr: { $gt: ["$p1_points", "p2_points"] } }, { 'p2_id': player._id, 'dq_p': { $ne: player._id }, 'ended_at': { $ne: null }, $expr: { $gt: ["$p2_points", "p1_points"] } }] })
                return_dict.total_prize_usd_cents = await this.db.collection(this.match).aggregate([{ $match: { $or: [{ 'p1_id': player._id, 'dq_p': { $ne: player._id }, 'ended_at': { $ne: null }, $expr: { $gt: ["$p1_points", "p2_points"] } }, { 'p2_id': player._id, 'dq_p': { $ne: player._id }, 'ended_at': { $ne: null }, $expr: { $gt: ["$p2_points", "p1_points"] } }] } }], { $group: { _id: null, sum: { $sum: '$prize_usd_cents' } } }).sum ?? return_dict.total_prize_usd_cents
                return_dict.efficiency = return_dict.num_join === 0 ? 0 : return_dict.num_won / return_dict.num_join
                let temp = await this.db.collection(this.match).findOne({ $or: [{ 'p1_id': player._id, 'ended_at': null }, { 'p2_id': player._id, 'ended_at': null }] })
                return_dict.in_active_match = temp ? temp._id : null
            }
            finally { }
            return return_dict
        }
    }

    async createMatch(p1_id, p2_id, entry_fee_usd_cents, prize_usd_cents) {
        let result
        let match = {
            created_at: new Date(),
            ended_at: null,
            entry_fee_usd_cents: entry_fee_usd_cents,
            is_dq: false,
            dq_p: null,
            p1_id: ObjectId(p1_id),
            p1_points: 0,
            p2_id: ObjectId(p2_id),
            p2_points: 0,
            prize_usd_cents: prize_usd_cents,
        }
        try {
            result = await this.db.collection(this.match).insertOne(match)
            let update_dict = { $inc: { balance_usd_cents: -entry_fee_usd_cents } }
            await this.db.collection(this.player).updateOne({ '_id': ObjectId(p1_id) }, update_dict)
            await this.db.collection(this.player).updateOne({ '_id': ObjectId(p2_id) }, update_dict)
            result = await this.db.collection(this.match).findOne({ '_id': result.insertedId })
        }
        finally { }
        return await this.normalizedMatch(result)
    }

    async getMatch(mid) {
        let result;
        try {
            result = await this.db.collection(this.match).findOne({ '_id': ObjectId(mid) })
            if (!result) {
                throw new Error()
            }
        }
        finally { }
        return await this.normalizedMatch(result)
    }

    getWinner_pid(match) {
        if (match.dq_p === match.p1_id) {
            return match.p2_id
        }
        else if (match.dq_p === match.p2_id) {
            return match.p1_id
        }
        else if (match.p1_points > match.p2_points) {
            return match.p1_id
        }
        else if (match.p1_points < match.p2_points) {
            return match.p2_id
        }
        else {
            return null
        }
    }

    async getMatches() {
        let result;
        try {
            //this.db.dropDatabase()
            result = await this.db.collection(this.match).find({}).toArray()
            result = await this.normalizedMatch(result)
            result.sort((a, b) => {
                if (a.prize_usd_cents > b.prize_usd_cents) {
                    return -1
                }
                if (a.prize_usd_cents < b.prize_usd_cents) {
                    return 1
                }
                return 0
            })
        }
        finally { }
        return result
    }

    async getSomeMatches(is_active) {
        let result;
        try {
            if (is_active == "true") {
                result = await this.db.collection(this.match).find({ 'ended_at': { $exists: false } }).toArray()
            }
            else if (is_active == "false") {
                result = await this.db.collection(this.match).find({ 'ended_at': { $exists: true } }).toArray()
            }
            result = await this.normalizedMatch(result)
            result.sort((a, b) => {
                if (a.prize_usd_cents < b.prize_usd_cents) {
                    return 1
                }
                if (a.prize_usd_cents > b.prize_usd_cents) {
                    return -1
                }
                return 0
            })
        }
        finally { }
        return result
    }

    async normalizedMatch(match) {
        if (match == null) {
            return null
        }
        if (Array.isArray(match)) {
            return await Promise.all(match.map(this.normalizedMatch, this))
        }
        else {
            let p1 = await this.db.collection(this.player).findOne({ '_id': ObjectId(match.p1_id) })
            let p2 = await this.db.collection(this.player).findOne({ '_id': ObjectId(match.p2_id) })
            let age = match.ended_at ? (match.ended_at - match.created_at) / 1000 : (new Date() - match.created_at) / 1000
            age = Math.round(age)
            let return_dict = {
                'mid': match._id,
                'entry_fee_usd_cents': match.entry_fee_usd_cents,
                'p1_id': match.p1_id,
                'p1_name': `${p1.fname}${p1.lname ? ` ${p1.lname}` : ''}`,
                'p1_points': match.p1_points === undefined ? 0 : match.p1_points,
                'p2_id': match.p2_id,
                'p2_name': `${p2.fname}${p2.lname ? ` ${p2.lname}` : ''}`,
                'p2_points': match.p2_points === undefined ? 0 : match.p2_points,
                'winner_pid': this.getWinner_pid(match),
                'is_dq': match.is_dq === undefined ? false : match.is_dq,
                'is_active': match.ended_at ? false : true,
                'prize_usd_cents': match.prize_usd_cents,
                'age': age,
                'ended_at': match.ended_at === undefined ? null : match.ended_at,
            }

            return return_dict
        }
    }

    getWinner_pid(match) {
        let is_active = match.ended_at ? false : true
        let p1_points = match.p1_points === undefined ? 0 : match.p1_points
        let p2_points = match.p2_points === undefined ? 0 : match.p1_points
        let is_dq = match.is_dq === undefined ? false : match.is_dq
        let dq_p = match.dq_p === undefined ? null : match.dq_p
        if (is_active) {
            return null
        }
        if ((p1_points > p2_points && is_dq == false) || (dq_p == match.p2_id)) {
            return match.p1_id
        }
        if ((p2_points > p1_points && is_dq == false) || (dq_p == match.p1_id)) {
            return match.p2_id
        }
        return null
    }

    async addPoints(mid, index, points) {
        let result;
        try {
            let update_dict = index === 1 ? { $inc: { p1_points: points } } : { $inc: { p2_points: points } }
            await this.db.collection(this.match).updateOne({ '_id': ObjectId(mid) }, update_dict)
            result = await this.db.collection(this.match).findOne({ '_id': ObjectId(mid) })
        }
        finally { }
        return await this.normalizedMatch(result)
    }

    async endMatch(mid) {
        let result;
        try {
            let update_dict_match = { $set: {} }
            update_dict_match.$set.ended_at = new Date()
            await this.db.collection(this.match).updateOne({ '_id': ObjectId(mid) }, update_dict_match)
            result = await this.db.collection(this.match).findOne({ '_id': ObjectId(mid) })
            let p1_points = result.p1_points === undefined ? 0 : result.p1_points
            let p2_points = result.p2_points === undefined ? 0 : result.p2_points
            let winner_pid = p2_points > p1_points ? result.p2_id : result.p1_id
            let update_dict_player = { $inc: { balance_usd_cents: result.prize_usd_cents } }
            await this.db.collection(this.player).updateOne({ '_id': ObjectId(winner_pid) }, update_dict_player)
        }
        finally { }
        return await this.normalizedMatch(result)
    }

    async dqPlayer(mid, pid) {
        let result;
        try {
            let update_dict_match = { $set: {} }
            update_dict_match.$set.ended_at = new Date()
            update_dict_match.$set.is_dq = true
            update_dict_match.$set.dq_p = pid
            await this.db.collection(this.match).updateOne({ '_id': ObjectId(mid) }, update_dict_match)
            result = await this.db.collection(this.match).findOne({ '_id': ObjectId(mid) })
            let winner_pid = pid === result.p1_id.toString() ? result.p2_id : result.p1_id
            let update_dict_player = { $inc: { balance_usd_cents: result.prize_usd_cents } }
            await this.db.collection(this.player).updateOne({ '_id': ObjectId(winner_pid) }, update_dict_player)
        }
        finally { }
        return await this.normalizedMatch(result)
    }

    async getDashboard(){
        let result = {
            total_num: 0,
            num_active: 0,
            num_inactive: 0,
            avg_balance: 0,
        }
        try {
            result.total_num = await this.db.collection(this.player).countDocuments()
            result.num_active = await this.db.collection(this.player).countDocuments({ 'is_active': true })
            result.num_inactive = await this.db.collection(this.player).countDocuments({ 'is_active': false })
            let temp = await this.db.collection(this.player).find({}).toArray()
            let sum = 0
            temp.forEach((d)=>{ sum += d.balance_usd_cents})
            result.avg_balance = result.total_num !== 0 ? sum/result.total_num : 0
        }
        finally { }
        return result
    }
}

let DB = new Database(MONGODBCONFIG)

app.get('/ping', (req, res) => {
    res.sendStatus(204)
})

app.get('/api/player', async (req, res) => {
    let q = req.query["q"]
    if(q !== undefined){
        let name = decodeURIComponent(q.split(';')[0])
        var vars = q.split(';')[1] || 'fname,lname'
        await DB.getNamePlayers(name, vars).then((player) => {
            res.status(200).send(player)
        })
        return
    }
    let is_active = req.query["is_active"]
    if (is_active == undefined || is_active == '*') {
        await DB.getPlayers().then((player) => {
            res.status(200).send(player)
        })
    }
    else {
        await DB.getSomePlayers(is_active).then((player) => {
            res.status(200).send(player)
        })
    }
})

app.get('/api/player/:pid', async (req, res) => {
    await DB.getPlayer(req.params.pid).then((player) => {
        res.status(200).send(JSON.stringify(player))
    }).catch((err) => res.sendStatus(404))
})

app.get('/api/dashboard/player', async (req, res) => {
    await DB.getDashboard().then((dashboard) => {
        res.status(200).send(JSON.stringify(dashboard))
    }).catch((err) => res.sendStatus(404))
})

app.delete('/api/player/:pid', async (req, res) => {
    await DB.deletePlayer(req.params.pid).then((result) => {
        // res.sendStatus(200)
        res.redirect(303, '/player')
    }).catch((err) => res.sendStatus(404))
})

app.post('/api/player', async (req, res) => {
    let error = false
    let fname = req.body.fname
    let lname = req.body.lname
    let resBody = 'invalid_fields: '
    let handed = req.body.handed
    let initial_balance_usd_cents = req.body.initial_balance_usd_cents
    if (fname == undefined || !(/^[a-zA-Z]+$/.test(fname))) {
        resBody += 'fname'
        error = true
    }
    if (lname == undefined || lname != undefined && !(/(^[a-zA-Z]+$)*/.test(lname))) {
        resBody += 'lname'
        error = true
    }
    if (handed == undefined || !(['left', 'right', 'ambi'].includes(handed.toLowerCase()))) {
        resBody += 'handed'
        error = true
    }
    if (initial_balance_usd_cents == undefined || isNaN(Number(initial_balance_usd_cents)) || Number(initial_balance_usd_cents) < 0 || !Number.isInteger(Number(initial_balance_usd_cents))) {
        resBody += 'balance_usd_cents'
        error = true
    }
    if (!error) {
        await DB.createPlayer(fname, lname, handedURL2Data[handed.toLowerCase()], Number(initial_balance_usd_cents)).then((player) => {
                res.status(200).send(JSON.stringify(player))
            })
    }
    else {
        res.status(422).send(resBody)
    }
})

app.post('/api/player/:pid', async (req, res) => {
    let error = false
    let lname = req.body.lname
    let is_active = req.body.active
    let pid = req.params.pid
    try {
        p1 = await DB.getPlayer(pid)
    }
    catch {
        res.sendStatus(404)
        return
    }
    if (is_active != undefined && ['1', 'true', 't'].includes(is_active.toLowerCase())) {
        is_active = true
    }
    else {
        is_active = false
    }
    if (lname == undefined || !(/(^[a-zA-Z]+$)*/.test(lname))) {
        error = true
    }
    if (!error) {
        await DB.updatePlayer(pid, lname, is_active).then(result => {
                res.status(200).send(JSON.stringify(result))
            })
    }
    else {
        res.status(422).send(resBody)
    }
})

app.post('/api/deposit/player/:pid', async (req, res) => {
    let pid = req.params.pid
    let deposit_value = req.query["amount_usd_cents"]
    if (isNaN(Number(deposit_value)) || Number(deposit_value) <= 0 || !Number.isInteger(Number(deposit_value))) {
        res.sendStatus(400)
        return
    }
    await DB.getBalance(pid, Number(deposit_value)).then(result => {
        res.status(200).send(JSON.stringify(result))
    }).catch(err => { res.sendStatus(404) })
})

app.get('/players.html', async (req, res) => {
    const data = await DB.getPlayers()
    const render = util.promisify(res.render).bind(res)
    res.render('layout', {
        body: await render(`pages/player/list`, { data })
    })
});

app.get('/player/create.html', async (req, res) => {
    const render = util.promisify(res.render).bind(res)
    res.render('layout', {
        body: await render(`pages/player/create`, {})
    })
});

app.get('/player/:pid/edit.html', async (req, res) => {
    const render = util.promisify(res.render).bind(res)
    res.render('layout', {
        body: await render(`pages/player/edit`, {})
    })
});

app.get('/dashboard.html', async (req, res) => {
    const render = util.promisify(res.render).bind(res)
    res.render('layout', {
        body: await render(`pages/dashboard`, {})
    })
});

app.get('/api/match', async (req, res) => {
    let is_active = req.query["is_active"] || 'true'
    if (is_active === '*') {
        await DB.getMatches().then((matches) => {
            res.status(200).send(JSON.stringify(matches))
        })
    }
    else {
        await DB.getSomeMatches(is_active).then((matches) => {
            res.status(200).send(JSON.stringify(matches))
        })
    }
})

app.get('/api/match/:mid', async (req, res) => {
    await DB.getMatch(req.params.mid).then((match) => {
        res.status(200).send(JSON.stringify(match))
    }).catch((err) => res.sendStatus(404))
})

app.post('/api/match', async (req, res) => {
    let p1_id = req.body.p1_id
    let p2_id = req.body.p2_id
    let p1
    let p2
    let entry_fee_usd_cents = req.body.entry_fee_usd_cents
    let prize_usd_cents = req.body.prize_usd_cents
    try {
        p1 = await DB.getPlayer(p1_id)
        p2 = await DB.getPlayer(p2_id)
    }
    catch {
        res.sendStatus(404)
        return
    }
    if (p1.in_active_match != null || p2.in_active_match != null) {
        res.sendStatus(409)
        return
    }
    if (p1.balance_usd_cents < Number(entry_fee_usd_cents) || p2.balance_usd_cents < Number(entry_fee_usd_cents)) {
        res.sendStatus(402)
        return
    }
    if (isNaN(Number(entry_fee_usd_cents)) || Number(entry_fee_usd_cents) < 0 || !Number.isInteger(Number(entry_fee_usd_cents))) {
        res.sendStatus(400)
        return
    }
    if (isNaN(Number(prize_usd_cents)) || Number(prize_usd_cents) < 0 || !Number.isInteger(Number(prize_usd_cents))) {
        res.sendStatus(400)
        return
    }
    await DB.createMatch(p1_id, p2_id, Number(entry_fee_usd_cents), Number(prize_usd_cents)).then((result) => {
        res.status(200).send(JSON.stringify(result))
    }).catch((err) => res.sendStatus(400))
})

app.post('/api/match/:mid/award/:pid', async (req, res) => {
    let player
    let match
    let mid = req.params.mid
    let pid = req.params.pid
    let points = req.query["points"]
    let index
    try {
        match = await DB.getMatch(mid)
        player = await DB.getPlayer(pid)
    }
    catch {
        res.sendStatus(404)
        return
    }
    if (!match.is_active) {
        res.sendStatus(409)
        return
    }
    if (player.pid.toString() !== match.p1_id.toString() && player.pid.toString() !== match.p2_id.toString()) {
        res.sendStatus(400)
        return
    }
    if (!player.is_active) {
        res.sendStatus(400)
        return
    }
    if (isNaN(Number(points)) || Number(points) <= 0 || !Number.isInteger(Number(points)) || points.indexOf('.') != -1) {
        res.sendStatus(400)
        return
    }
    index = pid === match.p1_id.toString() ? 1 : 2
    await DB.addPoints(mid, index, Number(points)).then((result) => {
        res.status(200).send(JSON.stringify(result))
    }).catch((err) => res.sendStatus(400))
})

app.post('/api/match/:mid/end', async (req, res) => {
    let mid = req.params.mid
    let match
    try {
        match = await DB.getMatch(mid)
    }
    catch {
        res.sendStatus(404)
        return
    }
    if (!match.is_active || match.p1_points === match.p2_points) {
        res.sendStatus(409)
        return
    }
    await DB.endMatch(mid).then((match) => {
        res.status(200).send(JSON.stringify(match))
    })
})

app.post('/api/match/:mid/disqualify/:pid', async (req, res) => {
    let mid = req.params.mid
    let pid = req.params.pid
    let match
    let player
    try {
        match = await DB.getMatch(mid)
        player = await DB.getPlayer(pid)
    }
    catch {
        res.sendStatus(404)
        return
    }
    if (!match.is_active) {
        res.sendStatus(409)
        return
    }
    if (player.pid.toString() !== match.p1_id.toString() && player.pid.toString() !== match.p2_id.toString()) {
        res.sendStatus(400)
        return
    }
    if (!player.is_active) {
        res.sendStatus(400)
        return
    }
    await DB.dqPlayer(mid, pid).then((result) => {
        res.status(200).send(JSON.stringify(result))
    }).catch((err) => res.sendStatus(400))
})

// try {
//     JSON.parse(fs.readFileSync(MONGODBCONFIG))
// }
// catch {
//     process.exit(2)
// }

app.listen(PORT, () => {
    console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
})