const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const PIN = process.env.OWNER_PIN || '2468';
const DB = path.join('/tmp', 'shoe-cleaning-data.json');

if (!fs.existsSync(DB)) {
  fs.writeFileSync(DB, '[]');
}

const read = () => JSON.parse(fs.readFileSync(DB, 'utf8'));

const write = (data) => {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
};

const send = (res, code, obj) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(obj));
};

const body = (req) =>
  new Promise((resolve, reject) => {
    let s = '';

    req.on('data', (chunk) => {
      s += chunk;
    });

    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
  });

const token = crypto.randomBytes(24).toString('hex');

function auth(req) {
  return (req.headers.authorization || '') === 'Bearer ' + token;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = url.parse(req.url, true);
    const p = u.pathname;

    // Check available booking times
    if (req.method === 'GET' && p === '/api/availability') {
      const booked = read()
        .filter(
          (x) =>
            x.date === u.query.date &&
            x.status !== 'cancelled'
        )
        .map((x) => x.time);

      return send(res, 200, { booked });
    }

    // Create a booking
    if (req.method === 'POST' && p === '/api/bookings') {
      const b = await body(req);

      for (const k of ['name', 'phone', 'service', 'date', 'time']) {
        if (!b[k]) {
          return send(res, 400, {
            error: 'Missing required information.'
          });
        }
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
        return send(res, 400, {
          error: 'Invalid date.'
        });
      }

      const validTimes = [
        '10:00 AM',
        '11:00 AM',
        '12:00 PM',
        '1:00 PM',
        '2:00 PM',
        '3:00 PM',
        '4:00 PM',
        '5:00 PM',
        '6:00 PM',
        '7:00 PM',
        '8:00 PM',
        '9:00 PM'
      ];

      if (!validTimes.includes(b.time)) {
        return send(res, 400, {
          error: 'Invalid time.'
        });
      }

      const db = read();

      if (
        db.some(
          (x) =>
            x.date === b.date &&
            x.time === b.time &&
            x.status !== 'cancelled'
        )
      ) {
        return send(res, 409, {
          error:
            'That time was just booked. Please choose another time.'
        });
      }

      const item = {
        id: crypto.randomBytes(4).toString('hex').toUpperCase(),
        ...b,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      db.push(item);
      write(db);

      return send(res, 201, {
        id: item.id,
        status: item.status
      });
    }

    // Admin login
    if (req.method === 'POST' && p === '/api/admin/login') {
      const b = await body(req);

      if (String(b.pin) !== String(PIN)) {
        return send(res, 401, {
          error: 'Invalid PIN.'
        });
      }

      return send(res, 200, { token });
    }

    // Get admin bookings
    if (req.method === 'GET' && p === '/api/admin/bookings') {
      if (!auth(req)) {
        return send(res, 401, {
          error: 'Unauthorized'
        });
      }

      const bookings = read().sort((a, b) =>
        (a.date + a.time).localeCompare(b.date + b.time)
      );

      return send(res, 200, bookings);
    }

    // Update booking status
    if (
      req.method === 'PATCH' &&
      p.startsWith('/api/admin/bookings/')
    ) {
      if (!auth(req)) {
        return send(res, 401, {
          error: 'Unauthorized'
        });
      }

      const id = p.split('/').pop();
      const b = await body(req);
      const db = read();

      const index = db.findIndex((x) => x.id === id);

      if (index < 0) {
        return send(res, 404, {
          error: 'Not found'
        });
      }

      const validStatuses = [
        'pending',
        'confirmed',
        'completed',
        'cancelled'
      ];

      if (!validStatuses.includes(b.status)) {
        return send(res, 400, {
          error: 'Invalid status'
        });
      }

      db[index].status = b.status;
      write(db);

      return send(res, 200, db[index]);
    }

    // Serve the website
    if (req.method === 'GET') {
      const file =
        p === '/'
          ? 'index.html'
          : p.replace(/^\/+/, '');

      const root = path.resolve(__dirname);
      const filePath = path.resolve(root, file);

      if (
        !filePath.startsWith(root + path.sep) ||
        !fs.existsSync(filePath)
      ) {
        return send(res, 404, {
          error: 'Not found'
        });
      }

      const ext = path.extname(filePath);

      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.css': 'text/css'
      };

      res.writeHead(200, {
        'Content-Type':
          types[ext] || 'application/octet-stream'
      });

      return fs.createReadStream(filePath).pipe(res);
    }

    return send(res, 404, {
      error: 'Not found'
    });

  } catch (e) {
    return send(res, 500, {
      error: 'Server error'
    });
  }
});

// Vercel serverless handler
module.exports = (req, res) => {
  server.emit('request', req, res);
};

// Normal Node.js server
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(
      `Shoe Cleaning app running on http://localhost:${PORT}`
    );
  });
}