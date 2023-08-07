const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbpath = path.join(__dirname, "twitterClone.db");
let db = null;

const intializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    app.listen(3001, () => {
      console.log("Server Running At: http://localhost:3001/");
    });
  } catch (error) {
    console.log(`DB Error Message: ${error.message}`);
    process.exit(1);
  }
};
intializeDBAndServer();

//Getting user following peoples Id:::

const getFollowingPeopleIdOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `SELECT following_user_id FROM follower
    INNER JOIN user ON user.user_id = follower.follower_user_id WHERE
    user.username='${username}';`;

  const followingPeople = await db.all(getTheFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};

//Authenticate Token :::

const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authorHeader = request.headers["authorization"];
  if (authorHeader) {
    jwtToken = authorHeader.split(" ")[1];
  }
  if (jwtToken) {
    jwt.verify(jwtToken, "My_Secert_Token", (error, playLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = playLoad.username;
        request.userId = playLoad.userId;
        console.log(request.userId);
        console.log(request.username);
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

// Tweet Acces Verificaton:::

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `SELECT * FROM tweet INNER JOIN follower 
  ON tweet.user_id = follower.following_user_id
        WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("invalid Request");
  } else {
    next();
  }
};

//API-1 : Register User

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `select * from user where username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const registerUserQuery = `insert into user(name, username, password,gender)
                values('${name}','${username}','${hashedPassword}','${gender}');`;
      const dbresponse = await db.run(registerUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API-2 : Login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const loginUserQuery = `select * from user where username = '${username}';`;
  const dbUser = await db.get(loginUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPassword = await bcrypt.compare(password, dbUser.password);
    if (isPassword) {
      const playLoad = { username, userId: dbUser.user_id };
      console.log(playLoad.userId);
      const jwtToken = jwt.sign(playLoad, "My_Secert_Token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-3 :

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const followingPeopleIds = await getFollowingPeopleIdOfUser(username);

  const getTweetsQuery = `SELECT username, tweet, date_time as dateTime 
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id 
    WHERE user.user_id IN (${followingPeopleIds})
    ORDER BY date_time DESC 
    Limit 4;`;

  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

//API-4 :

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  console.log(username, userId);
  const getFollowingUsersQuery = `
SELECT
name
FROM follower INNER JOIN user on user.user_id = follower.follower_user_id
WHERE follower.following_user_id = "${userId}";`;
  const followingPeople = await db.all(getFollowingUsersQuery);
  response.send(followingPeople);
});

//API-5:

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const getFollowersQuery = `SELECT DISTINCT name FROM 
        follower INNER JOIN user ON user.user_id = follower.follower_user_id
        WHERE following_user_id = ${userId};`;
  const followers = await db.all(getFollowersQuery);
  response.send(followers);
});

//API-6 :

app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `SELECT tweet, 
        (SELECT COUNT() FROM like WHERE tweet_id = ${tweetId}) AS likes, 
        (SELECT COUNT() FROM reply WHERE tweet_id = ${tweetId}) AS replies, 
        date_time AS dateTime FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
  }
);

//API-7 :

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `select username from user inner join like 
        on user.user_id = like.user_id where tweet_id = ${tweetId};`;

    const likedUsers = await db.all(getLikesQuery);
    const usersArray = likedUsers.map((eachUser) => eachUser.username);
    response.send({ likes: usersArray });
  }
);

//API-8 :

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliedQuery = `select * name, reply from user inner join 
        reply on user.user_id = reply.user_id where tweet_id = ${tweetId};`;
    const repliedUsers = await db.all(getRepliedQuery);
    response.send({ replies: repliedUsers });
  }
);

//API-9 :

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetsQuery = `SELECT tweet, 
        count(distinct like_id) AS likes, 
        count(distinct reply_id) AS replies,
        date_time AS dateTime FROM tweet LEFT JOIN reply ON 
        tweet.tweet_id = reply.tweet_id WHERE tweet.user_id = ${userId}
        GROUP BY tweet.tweet_id;`;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

//API-10 :

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `insert into tweet(tweet, user_id, date_time)
    values ('${tweet}', '${userId}', '${dateTime}');`;
  await db.run("Created a Tweet");
});

//API-11 :

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const getTheTweetQuery = `SELCT  * FROM tweet WHERE user_id = ${userId}
        AND tweet_id = ${tweetId};`;
    const tweet = await db.get(getTheTweetQuery);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id = '${tweetId}';`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
