// Test module with intentional code issues for PR review validation

// Issue 1: SQL Injection vulnerability
function getUserById(userId: string): any {
  const query = "SELECT * FROM users WHERE id = " + userId;
  return db.query(query);
}

// Issue 2: Hardcoded API key
function callExternalAPI(): void {
  const apiKey = "sk-prod-abc123xyz789";
  fetch("https://api.example.com/data", {
    headers: { "Authorization": `Bearer ${apiKey}` }
  });
}

// Issue 3: No error handling
async function fetchUserData(id: number): Promise<any> {
  const response = await fetch(`/api/users/${id}`);
  const data = response.json();
  return data;
}

// Issue 4: Inefficient nested loop O(n²)
function findDuplicates(items: string[]): string[] {
  const duplicates = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i !== j && items[i] === items[j]) {
        duplicates.push(items[i]);
      }
    }
  }
  return duplicates;
}

// Issue 5: Using var instead of const/let
function calculateTotal(prices: number[]): number {
  var total = 0;
  for (var i = 0; i < prices.length; i++) {
    total += prices[i];
  }
  return total;
}

// Issue 6: Loose equality
function validateStatus(code: any): boolean {
  if (code == "200" || code == 200) {
    return true;
  }
  return false;
}

// Issue 7: Missing null check
function processUser(user: any): string {
  return user.profile.name.toUpperCase();
}

export { getUserById, callExternalAPI, fetchUserData, findDuplicates, calculateTotal, validateStatus, processUser };
