// Test file for inline code review comments

const API_KEY = 'sk-12345678abcdef';
const db = { query: async (q: string) => [] as any[] };

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
          user: (result[i] as any).name,
          found: (result[j] as any).id === (result[i] as any).id
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
