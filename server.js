const express = require("express");
const userService = require("./services/users");
const commentService = require("./services/comments"); // Import the commentService correctly
const cookieParser = require("cookie-parser");
const roomService = require("./services/rooms");
const transcriptionService = require("./services/transcription");
const aoviService = require("./services/aovi");
const geodataService = require("./services/geodata");
const qr = require("qr-image");

const KeycloakAuthService = require("./services/auth/keycloak-auth.service");
const { createAccessControlRouter } = require("./services/access-control");

require('dotenv').config();

// Rate limiting for magic link requests
const magicLinkRequestLog = new Map(); // email -> { lastRequest: timestamp }
const port = 3000;
const app = express();
const server = require("http").createServer(app);

const authService = new KeycloakAuthService();
app.set('authService', authService);

// Initialize Keycloak middleware
try {
  app.use(authService.getSessionMiddleware());
  app.use(authService.getKeycloakMiddleware());
} catch (error) {
  console.error('Error initializing Keycloak:', error);
}

app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

userService.connectDB().catch((err) => {
  console.error("Error connecting to database", err);
});

// Passwordless Authentication Endpoints
app.post("/aovi/auth/magic-link", async (req, res) => {
  try {
    const { email, redirectUrl } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    // Rate limiting: 1 minute between requests
    const emailLower = email.toLowerCase();
    const requestInfo = magicLinkRequestLog.get(emailLower);
    const now = Date.now();
    
    if (requestInfo && (now - requestInfo.lastRequest) < 60000) {
      const waitTime = Math.ceil((60000 - (now - requestInfo.lastRequest)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitTime} seconds before requesting another sign-in link.`
      });
    }
    
    magicLinkRequestLog.set(emailLower, { lastRequest: now });
    
    const result = await authService.generateMagicLink(email, redirectUrl);
    res.json(result);
  } catch (error) {
    console.error('Error generating magic link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate sign-in link'
    });
  }
});

app.get("/aovi/auth/verify-signin/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { redirect } = req.query;
    
    const result = await authService.verifyMagicLink(token);
    
    if (result.success) {
      // Set session
      req.session = req.session || {};
      req.session.user = {
        id: result.user_id,
        email: result.email,
        name: result.email,
        authenticated: true,
        auth_method: 'passwordless'
      };
      
      // Save session explicitly
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
        }
        
        // Normalize redirect URL for localhost
        let redirectUrl = redirect || result.redirect_url || '/aovi/views/events';
        
        res.redirect(redirectUrl);
      });
    } else {
      console.error('Magic link verification failed:', result);
      res.redirect('/aovi/views/login?error=' + encodeURIComponent(result.error || 'Invalid sign-in link'));
    }
  } catch (error) {
    console.error('Error verifying sign-in link:', error);
    res.redirect('/aovi/views/login?error=' + encodeURIComponent('Failed to verify sign-in link'));
  }
});

app.post("/aovi/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    res.json({ success: true });
  });
});

app.get("/aovi/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/aovi/views/login');
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0"
  });
});

app.get("/aovi/auth/status", (req, res) => {
  const user = req.session?.user || null;
  
  res.json({
    authenticated: !!user,
    user: user
  });
});

// User info endpoint
app.get("/aovi/user/me", (req, res) => {
  const user = req.session?.user || null;
  
  if (!user) {
    return res.status(401).json({ 
      success: false, 
      message: "Not authenticated" 
    });
  }
  
  const userResponse = {
    ...user,
    role: user.roles || user.role || []
  };
  
  res.json(userResponse);
});

// Complete Access Control API
try {
  const accessControlRouter = createAccessControlRouter(authService);
  app.use("/aovi/access-control", accessControlRouter);
} catch (error) {
  console.error('Error setting up access control routes:', error);
}

const io = require("socket.io")(server, {
  path: "/aovi-socket-io",
  maxHttpBufferSize: 1 * 1024 * 1024, // 1 MB
});

io.on("connection", (socket) => {
  console.log("a user connected with id", socket.id);
  socket.on("disconnect", () => {
    console.log("user disconnected with id", socket.id);
  });

  socket.on("join", (msg) => {
    // if data is array, join all rooms
    if (Array.isArray(msg)) {
      msg.forEach((room) => {
        socket.join(room);
      });
    } else {
      socket.join(msg);
    }
  });
});

// New authentication middleware using passwordless sessions
const requireAuthentication = (req, res, next) => {
  if (req.session?.user?.authenticated) {
    req.body = req.body || {};
    req.body.user = req.session.user;
    req.body.authorized = true;
    next();
  } else {
    const originalTarget = req.originalUrl;
    res.redirect("/aovi/views/login?targeturl=" + originalTarget);
  }
};

const requireAuthenticationAPI = (req, res, next) => {
  if (req.session?.user?.authenticated) {
    req.body = req.body || {};
    req.body.user = req.session.user;
    req.body.authorized = true;
    next();
  } else {
    res.status(401).json({ 
      success: false, 
      message: "Authentication required", 
      redirect: "/aovi/views/login" 
    });
  }
};

// Protected routes using new passwordless authentication
app.use(
  "/aovi/comments",
  requireAuthenticationAPI,
  commentService.router(io)
);
app.use(
  "/aovi/rooms",
  requireAuthentication,
  roomService.router
);
app.use("/aovi/transcription", transcriptionService(io));
app.use("/aovi/geodata", geodataService.router);

app.use("/aovi", aoviService(io));

// // catch stray requests & redirect to eventlist
// app.use((req, res) => {
//     // if request is not looking for a static file, redirect to eventlist
//     if (!req.originalUrl.includes('/static')) {
//         res.redirect('/aovi/views/events');
//     }
// }
// );

app.get("/aovi/network/:eventid", async (req, res) => {
  const eventid = req.params.eventid;
  console.log("EVENT ID", eventid);
  let event = await roomService.Room.findById(eventid);
  // event to objec
  event = event.toObject();
  const containedRooms = event.containsRooms;
  event.containsRooms = [];

  for (let room of containedRooms) {
    let roomObj = await roomService.Room.findById(room);
    event.containsRooms.push(roomObj);
  }

  let comments = await commentService.Comment.find({ room: eventid });
  for (let room of event.containsRooms) {
    let roomComments = await commentService.Comment.find({ room: room._id });
    comments = comments.concat(roomComments);
  }

  links = [];

  // for each pair of comments, count the number of common users that agree / neutral / disagree on both
  for (let i = 0; i < comments.length; i++) {
    for (let j = i + 1; j < comments.length; j++) {
      const edge = {
        source: comments[i]._id,
        target: comments[j]._id,
        sharedagree: 0,
        shareddisagree: 0,
        sharedneutral: 0,
      };
      let comment1 = comments[i];
      let comment2 = comments[j];

      let commonUsersAgree = comment1.usersAgree.filter((value) =>
        comment2.usersAgree.includes(value)
      ).length;
      let commonUsersDisagree = comment1.usersDisagree.filter((value) =>
        comment2.usersDisagree.includes(value)
      ).length;
      let commonUsersNeutral = comment1.usersNeutral.filter((value) =>
        comment2.usersNeutral.includes(value)
      ).length;

      edge.sharedagree = commonUsersAgree;
      edge.shareddisagree = commonUsersDisagree;
      edge.sharedneutral = commonUsersNeutral;
      edge.value = commonUsersAgree + commonUsersDisagree + commonUsersNeutral;
      if (edge.value >= 1) {
        links.push(edge);
      }
    }
  }

  // limit to 1000 edges (highest value)
  links.sort((a, b) => b.value - a.value);
  links = links.slice(0, 1000);

  nodes = comments.map((comment) => {
    return {
      id: comment._id,
      text: comment.text.substring(0, 150),
      usersAgree: comment.usersAgree,
      usersDisagree: comment.usersDisagree,
      usersNeutral: comment.usersNeutral,
    };
  });

  res.json({ nodes, links });
  // console.log('event', event);
  // res.json(event);
});

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
