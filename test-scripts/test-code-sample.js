// Comprehensive test code with intentional issues for Claude Code Reviewer

// ========== SECURITY VULNERABILITIES ==========

function getUserData(userId) {
  // Issue 1: SQL Injection vulnerability
  const user = db.query("SELECT * FROM users WHERE id = " + userId);
  console.log("Fetching user:", userId);
  return user;
}

function processPayment(cardNumber, amount) {
  // Issue 2: Hardcoded API key (Secret exposure)
  const apiKey = "sk-1234567890abcdef";
  const secretToken = "token_prod_xyzabc123";

  // Issue 3: No error handling
  const response = fetch("https://payment-api.com/process", {
    method: "POST",
    body: JSON.stringify({
      card: cardNumber,
      amount: amount,
      key: apiKey,
      token: secretToken
    })
  });

  return response;
}

function redirectUser(userInput) {
  // Issue 4: Unvalidated redirect (Open redirect vulnerability)
  window.location.href = userInput;
}

function fileUpload(filename) {
  // Issue 5: Path traversal vulnerability
  const filePath = "./uploads/" + filename;
  fs.writeFileSync(filePath, userData);
  return filePath;
}

function decryptData(encryptedData) {
  // Issue 6: Weak cryptography (using deprecated MD5)
  const hash = require('md5');
  const decrypted = hash(encryptedData);
  return decrypted;
}

function validateInput(input) {
  // Issue 7: Insufficient input validation
  if (input) {
    return true;
  }
  return false;
}

function loadUserData(userId) {
  // Issue 8: Unsafe deserialization with eval
  var userData = eval("(" + userId + ")");
  return userData;
}

// ========== PERFORMANCE ISSUES ==========

function findUserByEmail(email, users) {
  // Issue 9: Inefficient O(n²) nested loop
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < users.length; j++) {
      if (users[j].email === email) {
        return users[j];
      }
    }
  }
  return null;
}

function fetchUserPosts(userId) {
  // Issue 10: N+1 database query pattern
  const user = db.query("SELECT * FROM users WHERE id = ?", [userId]);
  const posts = [];

  for (let i = 0; i < user.length; i++) {
    const post = db.query("SELECT * FROM posts WHERE userId = ?", [user[i].id]);
    posts.push(post);
  }

  return posts;
}

function searchDatabase(query) {
  // Issue 11: Missing caching for repeated queries
  const results = db.query("SELECT * FROM products WHERE name LIKE ?", ["%" + query + "%"]);
  return results;
}

function processLargeFile(data) {
  // Issue 12: Potential memory leak - reading entire file into memory
  const fullContent = fs.readFileSync('largefile.txt', 'utf-8');
  const allLines = fullContent.split('\n').map(line => {
    return { data: line, timestamp: new Date() };
  });

  allLines.forEach(line => {
    console.log(line);
  });
}

// ========== CODE STYLE & MAINTAINABILITY ISSUES ==========

function processData(d) {
  // Issue 13: Poor naming conventions
  var x = 10;
  var y = 20;
  var z = x + y;

  // Issue 14: Magic numbers without explanation
  if (d > 100) {
    return d * 1.5;
  }

  return d;
}

function complexFunction() {
  // Issue 15: Deep nesting (>3 levels)
  if (true) {
    if (true) {
      if (true) {
        if (true) {
          console.log("Too deeply nested");
        }
      }
    }
  }

  // Issue 16: Function too long
  console.log("Line 1");
  console.log("Line 2");
  console.log("Line 3");
  console.log("Line 4");
  console.log("Line 5");
  console.log("Line 6");
  console.log("Line 7");
  console.log("Line 8");
  console.log("Line 9");
  console.log("Line 10");
  console.log("Line 11");
  console.log("Line 12");

  return "done";
}

function duplicateLogic(user) {
  // Issue 17: Code duplication
  if (user.age > 18) {
    console.log("Adult");
    if (user.country === "US") {
      console.log("US Adult");
    }
  }

  if (user.role === "admin") {
    if (user.age > 18) {
      console.log("Adult");
      if (user.country === "US") {
        console.log("US Adult");
      }
    }
  }
}

// ========== BEST PRACTICES VIOLATIONS ==========

function handleUserLogin(username, password) {
  // Issue 18: No proper error handling
  const user = db.query("SELECT * FROM users WHERE username = ?", [username]);
  const isValid = checkPassword(password, user.password);

  // Issue 19: Generic error message
  if (!isValid) {
    throw new Error("Error");
  }

  return user;
}

function asyncOperation() {
  // Issue 20: Unhandled promise rejection
  fetch('/api/data').then(response => {
    return response.json();
  }).then(data => {
    console.log(data);
  });
}

function callbackHell() {
  // Issue 21: Callback hell / deeply nested callbacks
  fs.readFile('file1.txt', (err, data1) => {
    if (err) {
      fs.readFile('file2.txt', (err, data2) => {
        if (err) {
          fs.readFile('file3.txt', (err, data3) => {
            if (err) {
              fs.readFile('file4.txt', (err, data4) => {
                console.log(data4);
              });
            }
          });
        }
      });
    }
  });
}

function looseEquality() {
  // Issue 22: Using loose equality (== instead of ===)
  const value = "5";
  if (value == 5) {
    console.log("This is true but bad practice");
  }
}

function globalScope() {
  // Issue 23: Polluting global scope
  globalCounter = 0;
  globalName = "app";
  globalData = {};
}

function unusedCode() {
  // Issue 24: Unused variable
  const unusedVariable = "never used";
  const unused_import = require('unused-package');

  // Issue 25: Unused function
  function neverCalled() {
    return "This is never called";
  }

  console.log("Done");
}

function weakRandomness() {
  // Issue 26: Weak random number generation (not cryptographically secure)
  const token = Math.random().toString(36).substring(7);
  return token;
}

function defaultCredentials() {
  // Issue 27: Default/hardcoded credentials
  const dbUser = "admin";
  const dbPass = "admin123";
  const apiUsername = "default_user";
  const apiPassword = "password";

  return { dbUser, dbPass, apiUsername, apiPassword };
}

function raceCondition() {
  // Issue 28: Potential race condition
  var counter = 0;

  setTimeout(() => {
    counter++;
    console.log("Timeout:", counter);
  }, 100);

  counter++;
  console.log("Immediate:", counter);
}

function dataExposure(error) {
  // Issue 29: Exposing sensitive data in error messages
  console.error("Database error:", error.message, error.stack, error.dbConnection);
  console.log("User query failed:", error.query, error.params);
}

function resourceLeak() {
  // Issue 30: Resource leak - file not closed
  const file = fs.openSync('data.txt', 'r');
  const content = fs.readFileSync(file, 'utf-8');
  console.log(content);
  // Missing: fs.closeSync(file);
}

// ========== JAVASCRIPT-SPECIFIC ISSUES ==========

function varUsage() {
  // Issue 31: Using 'var' instead of 'const'/'let'
  var name = "John";
  var age = 30;
  var isActive = true;

  return { name, age, isActive };
}

function promiseError() {
  // Issue 32: Missing .catch() on promise chain
  return fetch('/api/users')
    .then(response => response.json())
    .then(data => process(data));
}

module.exports = {
  getUserData,
  processPayment,
  redirectUser,
  fileUpload,
  decryptData,
  validateInput,
  loadUserData,
  findUserByEmail,
  fetchUserPosts,
  searchDatabase,
  processLargeFile,
  processData,
  complexFunction,
  duplicateLogic,
  handleUserLogin,
  asyncOperation,
  callbackHell,
  looseEquality,
  globalScope,
  unusedCode,
  weakRandomness,
  defaultCredentials,
  raceCondition,
  dataExposure,
  resourceLeak,
  varUsage,
  promiseError
};
