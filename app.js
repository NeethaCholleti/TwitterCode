const express = require("express");
const app = express();

app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
module.exports = app;
//export default app;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http:/localhost:3000/");
    });
  } catch (e) {
    console.log(e.message);
  }
};

initializeDBAndServer();
//API1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (request.body.password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
      INSERT INTO 
        user (username, password, name,gender) 
      VALUES 
        (
          '${username}', 
          '${hashedPassword}',
          '${name}', 
          '${gender}'
          
        )`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
//API2
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        const userid = `SELECT user_id as userId FROM user WHERE username='${request.username}'`;
        const requestUserId = await db.get(userid);
        //console.log(parseInt(requestUserId.userId));
        request.userId = parseInt(requestUserId.userId);
        //console.log(request.userId);
        next();
      }
    });
  }
};
//API3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  console.log(userId);

  const tweetsQuery = `SELECT username, tweet, date_time as dateTime
  FROM
  user INNER JOIN follower ON user.user_id=follower.following_user_id
  INNER JOIN tweet ON follower.following_user_id=tweet.user_id
  WHERE follower_user_id=${userId}
  ORDER BY date_time DESC limit 4;
    `;
  const tweetArray = await db.all(tweetsQuery);
  console.log(tweetArray);
  response.send(tweetArray);
});

//API4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const followingQuery = `SELECT name
  FROM
  follower
  INNER JOIN  user ON follower.following_user_id=user.user_id
  WHERE follower_user_id=${userId}
  ORDER BY following_user_id
  ;
  `;
  const followingArray = await db.all(followingQuery);
  response.send(followingArray);
});

//API5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const followingQuery = `SELECT name
  FROM
  follower
  INNER JOIN  user ON follower.follower_user_id=user.user_id
  WHERE following_user_id=${userId}
  ORDER BY follower_user_id
  ;
  `;
  const followingArray = await db.all(followingQuery);
  response.send(followingArray);
});

//API6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const { tweetId } = request.params;
  //const tweetUserIdQuery = `SELECT user_id FROM tweet where tweet_id=${tweetId};`;
  //const tweetUserId = await db.get(tweetUserIdQuery);
  //console.log(tweetUserId);
  //console.log(tweetUserId.user_id === userId);
  const tweetUserIdQuery = `SELECT user_id as tweetUserId FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetUserId = await db.get(tweetUserIdQuery);
  const followingUserIdQuery = `SELECT following_user_id as followingId FROM follower WHERE follower_user_id=${userId};`;
  const followingUserId = await db.get(followingUserIdQuery);
  console.log(followingUserId);
  console.log(tweetUserId);
  if (tweetUserId.tweetUserId === followingUserId.followingId) {
    const getResponseQuery = `SELECT tweet, count(like_id) as likes,count(reply_id) as replies,date_time as dateTime 
      FROM tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id INNER JOIN reply ON tweet.tweet_id=reply.tweet_id 
      WHERE tweet.tweet_id=tweetId;`;
    const getResponse = db.get(getResponseQuery);
    response.send(getResponse);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const tweetUserIdQuery = `SELECT user_id as tweetUserId FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetUserId = await db.get(tweetUserIdQuery);
    const followingUserIdQuery = `SELECT following_user_id as followingId FROM follower WHERE follower_user_id=${userId};`;
    const followingUserId = await db.get(followingUserIdQuery);
    console.log(followingUserId);
    console.log(tweetUserId);
    let likes = [];
    if (tweetUserId.tweetUserId === followingUserId.followingId) {
      const getResponseQuery = `SELECT username as name FROM user INNER JOIN like WHERE like.tweet_id=;`;
      const getResponse = db.get(getResponseQuery);
      likes.append(getResponse);
      response.send(likes);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
//API8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const tweetUserIdQuery = `SELECT user_id as tweetUserId FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetUserId = await db.get(tweetUserIdQuery);
    const followingUserIdQuery = `SELECT following_user_id as followingId FROM follower WHERE follower_user_id=${userId};`;
    const followingUserId = await db.get(followingUserIdQuery);
    console.log(followingUserId);
    console.log(tweetUserId);
    let reply = [];
    if (tweetUserId.tweetUserId === followingUserId.followingId) {
      const getResponseQuery = `SELECT name,reply FROM user INNER JOIN reply WHERE reply.tweet_id=${tweetId};`;
      const getResponse = db.get(getResponseQuery);
      reply.append(getResponse);
      response.send(reply);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
//API9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  //console.log(username);
  const tweetQuery = `SELECT tweet,count(like_id) as likes , count(reply_id) as replies,date_time as dateTime FROM tweet 
  INNER JOIN reply ON tweet.tweet_id=reply.tweet_id
  INNER JOIN like ON tweet.tweet_id=like.tweet_id WHERE tweet.user_id=${userId};`;
  const tweetResponse = await db.all(tweetQuery);
  console.log(tweetResponse);
  response.send(tweetResponse);
});

//API10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  //console.log(parseInt(userId));
  const tweetDetails = request.body;
  const { tweet } = tweetDetails;
  const postTweetQuery = `INSERT INTO tweet(tweet) VALUES('${tweet}') ;`;
  const tweetResponse = await db.run(postTweetQuery);
  const tweetId = tweetResponse.lastID;
  response.send("Created a Tweet");
});
//API11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserIdQuery = `SELECT user_id as userId from user where username='${username}';`;
    const registerUserId = await db.get(getUserIdQuery);
    const tweetUserIdQuery = `SELECT user_id FROM tweet where tweet_id=${tweetId};`;
    const tweetUserId = await db.get(tweetUserIdQuery);
    //console.log(tweetUserId);
    //console.log(registerUserId);
    //console.log(tweetUserId === registerUserId);
    //console.log(userId === tweetId);
    if (tweetUserId.user_id == registerUserId.userId) {
      const deleteTweetQuery = `
        DELETE 
        FROM
            tweet
        WHERE
            tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
