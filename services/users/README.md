# User Authentication

**Note: This service is currently using passwordless authentication via email sign-in links.**

The JWT/password-based authentication system in this directory is legacy code maintained for potential future use. The current production system uses:
- Email-based passwordless authentication 
- Session management through Keycloak service
- Role-based access control through access-control service

## Legacy JWT System
Originally based on tutorial: https://www.freecodecamp.org/news/how-to-authenticate-users-and-implement-cors-in-nodejs-applications/
Code reference: https://github.com/LoginRadius/engineering-blog-samples/blob/master/NodeJs/NodejsAuthenticationGuide

Database connection assumes existing MongoDB connection is established. 
