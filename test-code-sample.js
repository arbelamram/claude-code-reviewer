// Example code with intentional issues for Claude to review

function getUserData(userId) {
  // Issue 1: SQL Injection vulnerability
  const user = db.query("SELECT * FROM users WHERE id = " + userId);
  
  // Issue 2: Console.log in production code
  console.log("Fetching user:", userId);
  
  return user;
}

function processPayment(cardNumber, amount) {
  // Issue 3: Hardcoded sensitive data
  const apiKey = "sk-1234567890abcdef";
  
  // Issue 4: No error handling
  const response = fetch("https://payment-api.com/process", {
    method: "POST",
    body: JSON.stringify({ card: cardNumber, amount: amount, key: apiKey })
  });
  
  return response;
}

function findUserByEmail(email, users) {
  // Issue 5: Inefficient O(n²) nested loop
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < users.length; j++) {
      if (users[j].email === email) {
        return users[j];
      }
    }
  }
  
  return null;
}

function validateInput(input) {
  // Issue 6: No input validation
  if (input) {
    return true;
  }
  return false;
}

module.exports = { getUserData, processPayment, findUserByEmail, validateInput };