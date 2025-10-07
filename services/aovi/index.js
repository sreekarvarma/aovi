
const aoviService = function(io){
    const express = require('express');
    const path = require('path');
    const qr = require('qr-image');
    const router = express.Router();
    const { Comments } = require('../comments');
    const { Rooms } = require('../rooms');

    // New authentication middleware for this service
    const requireAuth = (req, res, next) => {
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

    router.use(express.json());
    router.use(express.urlencoded({ extended: true }));

    router.use('/static', express.static(path.join(__dirname, 'client')));

    // Passwordless authentication login page
    router.get('/views/login', (req, res) => {
        res.sendFile(__dirname + '/client/login.html');
    });

    // Passwordless authentication registration page
    router.get('/views/register', (req, res) => {
        res.sendFile(__dirname + '/client/login.html');
    });

    // Email service status endpoint
    router.get('/email/status', (req, res) => {
        try {
            const authService = req.app.get('authService');
            if (authService && authService.emailService) {
                res.json(authService.emailService.getStatus());
            } else {
                res.json({
                    initialized: false,
                    error: 'Email service not available'
                });
            }
        } catch (error) {
            res.status(500).json({
                initialized: false,
                error: error.message
            });
        }
    });
    
    router.get('/views/events', requireAuth, (req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.sendFile(__dirname + '/client/eventlist.html');
    });

    router.get('/views/events/create', requireAuth, (req, res) => {
        res.sendFile(__dirname + '/client/createevent.html');
    });
    
    router.get('/views/events/:event', requireAuth, (req, res) => {
        res.sendFile(__dirname + '/client/event.html');
    });

    router.get('/views/events/:event/registration', requireAuth, (req, res) => {
        res.sendFile(__dirname + '/client/eventregistration.html');
    });
   
    router.get('/views/events/:event/room/:room', requireAuth, (req, res) => {
        res.sendFile(__dirname + '/client/room.html');
    });
     
    router.get('/views/events/:event/overview', requireAuth, (req, res) => {
        res.sendFile(__dirname + '/client/overview.html');
    });
    
    router.get('/views/events/:event/timeline', requireAuth, (req, res) => {
        res.sendFile(__dirname + '/client/timeline.html');
    });
    
    // evententry/:event
    router.get('/views/events/:event/entry', requireAuth, (req, res) => {
        res.sendFile(__dirname + '/client/evententry.html');
    });
    

    // evententry/:event
    router.get('/views/events/:event/network', requireAuth, (req, res) => {
        res.sendFile(__dirname + '/client/network.html');
    });
    

    router.get('/eventjson/:event', requireAuth, async (req, res) => {
       try{ 
        
        const event = await Rooms.findById(req.params.event);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const rooms = await Rooms.find({ _id: { $in: event.containsRooms } });

        let comments = [];
        
        await Promise.all(rooms.map(async (room) => {
            const roomComments = await Comments.find({ room: room._id });
            comments = comments.concat(roomComments);
        }));

        res.status(200).send(comments);
        } catch(error){
         
        res.status(404).json({ message: 'Event not found' });

        }


    });



    router.get('/events/:event/qr', requireAuth, (req, res) => {
        // generate qr code for url
        const url = req.params.url;
    
        const protocol = req.protocol;
        const host = req.get('host');
        const originalUrl = req.originalUrl;
    
        const completeUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    
        const targetLink = protocol + '://' + host + '/aovi/views/events/' + req.params.event + "/registration";
    
        const code = qr.image(targetLink, { type: 'png' });
        res.setHeader('Content-type', 'image/png');
        code.pipe(res);
    });


    // root should go to event list
    router.get('/', requireAuth, (req, res) => {
        res.redirect('/aovi/views/events');
    });

    return router;

}

module.exports = aoviService;
