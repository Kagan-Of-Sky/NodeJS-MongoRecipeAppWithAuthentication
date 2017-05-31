/*
Mark Kaganovsky
100963794

COMP2406 - Fundamentals of Web Applications

Winter 2017

Some comments may seem verbose, however they are for
me in the future if I choose to use this assignment
as a learning resource.
*/

// Require modules
const express = require("express");
const bodyParser = require("body-parser");
const mongo = require("mongodb").MongoClient;

// Global database reference.
var db;
const DB_PATH = "mongodb://localhost:27017/recipeDB";
const C_RECIPES = "recipes";

// Create express instance
let app = express();

// Set views directory and view engine
app.set("views", "./views");
app.set("view engine", "pug");

// Render index page.
app.get("/", function(req, res){
	res.render("index.pug");
});

// Handle requests for the recipes listing.
app.get("/recipes", function(req, res){
	db.collection(C_RECIPES).find({}, {name:1}).toArray(function(error, documents){
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
});

// Handle request for a specific recipe.
app.get("/recipe/:recipeName", function(req, res){
	let recipeName = req.params.recipeName;

	let query = { name : recipeName };

	// Assume unique recipe name, find it.
	db.collection(C_RECIPES).findOne(query, function(error, result){
		if(error){
			logHelper("ERROR: Could not find recipe.", query, error);
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
});

// Install body parser, parse nested objects
app.use("/recipe", bodyParser.urlencoded({extended:true}));

// Handle POSTs of a recipe.
app.post("/recipe", function(req, res){
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
	db.collection(C_RECIPES).updateOne(filter, newRecipe, options, function(error, item){
		if(error){
			logHelper("ERROR: Could not upsert new item into database.", error);
			res.status(500).send("Server side error, could not upload recipe.");
			return;
		}

		// Send success code and message.
		res.status(200).send("Recipe successfully uploaded.");
	});
});

// Set static file route middleware for all other requests not handled above.
app.use(express.static("public"));

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




/*

*/
function logHelper(){
	console.log("-------------------------------------------------------------------------------");

	for(let i=0; i<arguments.length; ++i){
		console.log(arguments[i]);
	}
}
