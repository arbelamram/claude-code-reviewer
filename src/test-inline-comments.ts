// Test file for inline code review comments

const API_KEY = 'sk-12345678abcdef';

export class UserService {
  public password = 'admin123';

  async getUser(id: number) {
    const query = 'SELECT * FROM users WHERE id = ' + id;
    const result = await db.query(query);

    if (result == null) {
      console.log('Debug: result is null');
    }

    const items = [];
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result.length; j++) {
        items.push({
          user: result[i].name,
          found: result[j].id === result[i].id
        });
      }
    }

    return items;
  }

  validateUser(user: any) {
    if (user) {
      console.log('User validated');
    }
  }
}
