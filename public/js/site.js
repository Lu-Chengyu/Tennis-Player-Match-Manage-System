function list() {
    window.location.href = '/players.html'
}
function create() {
    window.location.href = '/player/create.html'
}
function dashboard() {
    window.location.href = '/dashboard.html'
}
function editCheck() {
    let error = false
    let errors = 'Errors:'
    let lname = document.getElementById('last_name').value
    let active = document.getElementById('true').checked
    if (lname == undefined || !(/^[a-zA-Z]+$/.test(lname))) {
        errors += ' lname,'
        error = true
    }
    if (error) {
        document.getElementById('flash-message').innerHTML = errors
        document.getElementById('flash').style.display = 'block'
    } else {
        const playerData = {
            lname: lname,
            active: active ? 'true' : 'false',
        }
        try {
            let url = new URL(window.location.href)
            let playerId = url.pathname.split('/')[2]
            // console.log(JSON.stringify(playerData))
            fetch(`/api/player/${playerId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(playerData),
            })
            window.location.href = '/players.html'
        } catch (error) {
            document.getElementById('flash-message').innerHTML = error.message
            document.getElementById('flash').style.display = 'block'
        }
    }
}
function createCheck() {
    let error = false
    let errors = 'Errors:'
    let fname = document.getElementById('fname').value
    let lname = document.getElementById('lname').value
    let handed = document.getElementById('handed').value
    let initial_balance_usd_cents = document.getElementById('initial_balance_usd_cents').value
    if (fname == undefined || !(/^[a-zA-Z]+$/.test(fname))) {
      errors += ' fname,'
      error = true
    }
    if (lname == undefined || !(/(^[a-zA-Z]+$)*/.test(lname))) {
      errors += ' lname,'
      error = true
    }
    if (handed == undefined || !(['left', 'right', 'ambi'].includes(handed.toLowerCase()))) {
      errors += ' handed,'
      error = true
    }
    if (initial_balance_usd_cents == undefined || isNaN(Number(initial_balance_usd_cents)) || Number(initial_balance_usd_cents) < 0 || !Number.isInteger(Number(initial_balance_usd_cents))) {
      errors += ' balance_usd_cents,'
      error = true
    }
    if (error) {
      document.getElementById('flash-message').innerHTML = errors
      document.getElementById('flash').style.display = 'block'
    } else {
      const playerData = {
        fname: fname,
        lname: lname,
        handed: handed.toLowerCase(),
        initial_balance_usd_cents: initial_balance_usd_cents,
      }
      try {
        fetch('/api/player', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(playerData),
        })
        window.location.href = '/players.html'
      } catch (error) {
        document.getElementById('flash-message').innerHTML = error.message
        document.getElementById('flash').style.display = 'block'
      }
    }
  }