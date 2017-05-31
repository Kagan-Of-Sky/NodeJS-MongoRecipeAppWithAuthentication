/*
Mark Kaganovsky
100963794

COMP2406 - Fundamentals of Web Applications

Winter 2017

Authentication code provided by Prof.Andrew Runka

Some comments may seem verbose, however they are for
me in the future if I choose to use this assignment
as a learning resource.
*/

// Require modules
const express = require("express");
const bodyParser = require("body-parser");
const mongo = require("mongodb").MongoClient;

// Modules for Authentication
const hat = require('hat'); //creates random tokens
const cookieParser = require('cookie-parser');

// Global database reference, so a new connection does not need to be made for every user.
var db;
const DB_PATH = "mongodb://localhost:27017/recipeDB";

// Create express instance
let app = express();

// Set views directory and view engine
app.set("views", "./views");
app.set("view engine", "pug");

// Request for main page, must check for whether user is still logged in.
app.get(['/', '/index.html', '/home', '/index'], cookieParser(), function(req,res){
	authenticateUser(req.cookies.username, req.cookies.token, function(isSuccessfull, user){
		res.render('index', isSuccessfull ? {user: {username:req.cookies.username, auth:user.auth}} : {});
	});
});

//send user login page
app.get('/login', function(req,res){
	res.render('login');
});

//send user registration page
app.get('/register', function(req,res){
	res.render('register');
});

app.use(['/login','/register'], bodyParser.urlencoded({extended:false}));

//handle user login
app.post('/login', function(req,res){
	//console.log(req.body);  //uncomment to see the login data object

	db.collection("clients").findOne({username:req.body.username},function(err,user){
		if(err){
			console.log("Error performing find : ", err);
			res.sendStatus(500);
		}else if(!user){ //not found
			res.render('login',{warning:"Username not found"});
		}else if(user.password!==req.body.password){  //user exists, wrong password
			console.log("incorrect password: ", user.password+"!="+req.body.password);
			res.render('login',{warning:"Incorrect password"});
		}else{	//user exists && pwd correct
			console.log("Log in successful");
			//create auth token
			var token = hat(); //create a random token
			user.auth=token; //save token with the specific user

			db.collection("clients").update({_id:user._id},user,function(err,result){ //update the document
				if(err){
					console.log("Error updating the database: ",err);
					res.sendStatus(500);
				}else{
					createAuthCookies(user,res);
					res.redirect("/");
				}
			});
		}
	});
});

app.get('/logout',function(req,res){
	console.log("Logging out...");
	res.clearCookie("token",{path:'/'});
	res.clearCookie("username",{path:'/'});
	res.redirect('/login');
});

app.post('/register', function(req,res){
	db.collection("clients").findOne({username:req.body.username},function(err,user){
		if(err){
			console.log("Error performing find: ", err);
			res.sendStatus(500);
		}else if(user){ 	//if name exists
			//render login page with warning
			res.render('register',{warning:"Username already exists"});
		}else{ //user not found
			// Check if valid username.
			if(!isValidUsername(req.body.username)){
				res.render('register',{warning:"Error, invalid username. A username may only consist of lowercase alphabetic characters."});
				return;
			}
			//add to db, and perform authentication
			var user = new User(req.body.username, req.body.password);
			//create auth token
			var token = hat(); //create a random token
			user.auth=token; //save token with the specific user

			db.collection("clients").insert(user, function(err,result){
				if(err){
					console.log("Error inserting into database: ",err);
					res.sendStatus(500);
				}else{
					createAuthCookies(user,res);
					//tell the browser to request the main page
					res.redirect("/");
				}
			});
		}
	});
});

// Handle requests for the recipes listing.
app.get("/recipes", cookieParser(), function(req, res){
	authenticateUser(req.cookies.username, req.cookies.token, function(isSuccessfull, user){
		if(isSuccessfull){
			db.collection(getRecipeCollectionName(req.cookies.username)).find({}, {name:1}).toArray(function(error, documents){
				if(error){
					logHelper("ERROR: Could not fetch recipe listing.", error);
					res.status(500).send("Could not load recipe listing");
					return;
				}

				// Send list of recipes.
				let recipesList = [];
				documents.forEach(function(element){ recipesList.push(element.name); });
				res.send({names:recipesList});
			});
		}
		else{
			res.redirect("/login");
		}
	});
});

// Handle request for a specific recipe.
app.get("/recipe/:recipeName", cookieParser(), function(req, res){
	// Check if recipe is specified.
	if(!req.params.recipeName){
		res.sendStatus(400);
		return;
	}

	console.log("Requesting recipe: " + req.params.recipeName);

	authenticateUser(req.cookies.username, req.cookies.token, function(isSuccessfull, user){
		if(isSuccessfull){
			let recipeName = req.params.recipeName;

			// Assume unique recipe name, find it.
			db.collection(getRecipeCollectionName(req.cookies.username)).findOne({name:recipeName}, function(error, result){
				if(error){
					logHelper("ERROR: /recipe/:recipeName", query, error);
					res.status(500).send("Database error");
					return;
				}
				else if(!result){
					res.status(404).send(`404, Recipe '${recipeName}' not found.`);
					return;
				}

				// Send recipe, send only the fields that are required by the client.
				res.send({
					name : result.name,
					duration : result.duration,
					ingredients : result.ingredients,
					directions : result.directions,
					notes : result.notes
				});
			});
		}
		else{
			res.redirect("/login");
		}
	});
});

// Install body parser, parse nested objects
app.use("/recipe", bodyParser.urlencoded({extended:true}));

// Handle POSTs of a recipe.
app.post("/recipe", cookieParser(), function(req, res){
	authenticateUser(req.cookies.username, req.cookies.token, function(isSuccessfull, user){
		if(isSuccessfull){
			if(!req.body.name){
				res.status(400).send("Recipe must consist of at least a name.");
				return;
			}

			// New recipe to submit to database.
			let newRecipe = {
				name: req.body.name,
				duration: req.body.duration,
				ingredients: req.body.ingredients,
				directions: req.body.directions,
				notes: req.body.notes
			};

			let filter = { name: req.body.name };

			let options = { upsert: true };

			// Assume unique name, update only one document.
			db.collection(getRecipeCollectionName(req.cookies.username)).updateOne(filter, newRecipe, options, function(error, item){
				if(error){
					logHelper("ERROR: Could not upsert new item into database.", error);
					res.status(500).send("Server side error, could not upload recipe.");
					return;
				}

				// Send success code and message.
				res.status(200).send("Recipe successfully uploaded.");
			});
		}
		else{
			res.redirect("/login");
		}
	});
});

// Set static file route middleware for all other requests not handled above.
app.use(express.static("public"));

// Connect to database.
mongo.connect(DB_PATH, function(error, database){
	if(error){
		logHelper("Could not connect to database.");
		throw error;
	}

	// Start server.
	app.listen(2406, function(){
		db = database;
		logHelper("Database connected to, server started on port 2406.");
	});
});

//constructor for users
function User(name,pass){
	this.username = name;
	this.password = pass;
}

// Creates authenticatin cookies for a user.
function createAuthCookies(user,res){
	res.cookie('token', user.auth, {path:'/', maxAge:3600000});
	res.cookie('username', user.username, {path:'/', maxAge:3600000});
}

// Takes in a username and returns the corresponding recipes collection for that username.
function getRecipeCollectionName(username){
	return "recipes." + username;
}

// Makes sure this user is
function isValidUsername(username){
	return (/^[a-z]+$/).test(username);
}

// Takes a username and token and checks the database for whether the tokens match for that user.
// If the tokens match, then the callback is called with the arguments: true, user
// Otherwise the callback is called with false and no user is passed.
function authenticateUser(username, token, callback){
	db.collection("clients").findOne({username:username},function(err,user){ //assume unique usernames.
		if(user && user.auth === token){
			callback(true, user);
		}
		else{
			callback(false);
		}
	});
}

// Prints out a line seperator then loops through the list of arguments sent to it and prints them.
function logHelper(){
	console.log("-------------------------------------------------------------------------------");

	for(let i=0; i<arguments.length; ++i){
		console.log(arguments[i]);
	}
}
