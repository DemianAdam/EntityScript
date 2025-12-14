# EntityScript

EntityScript is a lightweight, ORM-like library for Google Apps Script that maps Google Sheets to objects. It allows you to interact with spreadsheets as if they were databases, providing a structured and intuitive way to manage your data.

It automatically handles sheet and header creation, data validation, CRUD operations, and complex relationships like one-to-many and many-to-one.

## Features

*   **Schema-based Modeling**: Define your data structure, validation rules, and default values using simple schema objects.
*   **Automatic Sheet Management**: Automatically creates new sheets for your entities if they don't exist and ensures headers match your schema.
*   **Full CRUD Functionality**: A complete set of methods to `insert`, `update`, `remove`, `findById`, and query (`all`, `where`) data.
*   **Relationship Management**: Easily define and populate parent-child (`children`) and reference (`references`) relationships between your entities with a `depth` parameter.
*   **Data Validation**: Enforce data integrity with built-in rules like `required`, `unique`, `type`, `regex`, `min`, `max`, and custom validation functions.
*   **Built-in Utilities**: Includes helpers for hashing (`SHA-256`) and JWT validation.

## Setup

1.  Create a new Google Apps Script project linked to the Google Sheet you want to use.
2.  Copy the contents of the following files from this repository into separate script files within your project:
    *   `src/Context.js`
    *   `src/EntityDefinition.js`
    *   `src/SheetSet.js`
    *   `src/Utils.js`
3.  Ensure your `appsscript.json` manifest file is set to use the `V8` runtime:
    ```json
    {
      "timeZone": "Your/Timezone",
      "dependencies": {},
      "exceptionLogging": "STACKDRIVER",
      "runtimeVersion": "V8"
    }
    ```

## Usage Example

Let's model a simple blog with `Users` and `Posts`. A user can have many posts.

```javascript
// This would be in your main script file, e.g., Code.gs

function runApp() {
  // 1. Define your entities
  const userDefinition = createEntityDefinition('Users', {
    id: { type: 'string', required: true, unique: true },
    name: { type: 'string', required: true },
    email: { type: 'string', required: true, unique: true },
    // Define the one-to-many relationship: A User has many Posts
    children: [
      {
        setSheet: 'Posts',      // The name of the child entity's sheet
        localField: 'id',     // The key on this entity (Users)
        foreignField: 'userId', // The key on the child entity (Posts)
        as: 'posts'           // The property name to populate on the User object
      }
    ]
  });

  const postDefinition = createEntityDefinition('Posts', {
    id: { type: 'string', required: true, unique: true },
    title: { type: 'string', required: true },
    content: { type: 'string' },
    userId: { type: 'string', required: true },
    // Define the many-to-one relationship: A Post belongs to a User
    references: {
      sheetSet: 'Users',      // The name of the parent entity's sheet
      localField: 'userId',   // The key on this entity (Posts)
      foreignField: 'id',     // The key on the parent entity (Users)
      as: 'author'          // The property name to populate on the Post object
    }
  });

  // 2. Create the context
  // Replace 'YOUR_SPREADSHEET_ID' with your actual Google Sheet ID
  const db = createContext('YOUR_SPREADSHEET_ID', [userDefinition, postDefinition]);

  // Clear previous data for a clean run
  db.Posts.removeAll();
  db.Users.removeAll();


  // 3. Insert data
  const newUser = db.Users.insert({
    name: 'Jane Doe',
    email: 'jane.doe@example.com'
  });
  Logger.log('Created User: %s', JSON.stringify(newUser));

  const newPost = db.Posts.insert({
    title: 'My First Post',
    content: 'Hello from EntityScript!',
    userId: newUser.id
  });
  Logger.log('Created Post: %s', JSON.stringify(newPost));


  // 4. Query data with relationships
  
  // Find a user by ID and populate their posts (depth = 1)
  const userWithPosts = db.Users.findById(newUser.id, 1);
  Logger.log('User with Posts: %s', JSON.stringify(userWithPosts, null, 2));
  // Expected output will include an array of post objects under the "posts" key

  // Get all posts and populate their author (depth = 1)
  const allPostsWithAuthors = db.Posts.all(1);
  Logger.log('Post with Author: %s', JSON.stringify(allPostsWithAuthors[0], null, 2));
  // Expected output will include a user object under the "author" key
}
```

## API Reference

### `createEntityDefinition(name, schema)`
Creates a definition for an entity.

*   `name` (String): The name of the entity. This will also be the name of the Google Sheet tab.
*   `schema` (Object): An object where keys are header names and values are validation rule objects.
    *   `type`: (String) `string`, `number`, `date`. The library will attempt to cast values.
    *   `required`: (Boolean) If `true`, the value cannot be `null`, `undefined`, or `''`.
    *   `unique`: (Boolean) If `true`, the value in this column must be unique across all rows.
    *   `defaultValue`: The value to use if none is provided.
    *   `regex`: (RegExp) A regular expression to test the value against.
    *   `min` / `max`: (Number) Minimum or maximum value for a number.
    *   `validate`: (Function) A custom validation function `(value, allRows, currentRow) => {}`. Should throw an error on failure.
    *   `references`: (Object) Defines a many-to-one relationship. See example.
    *   `children`: (Array of Objects) Defines one-to-many relationships. See example.

### `createContext(spreadSheetId, entityDefinitions)`
Initializes the ORM and connects to your spreadsheet.

*   `spreadSheetId` (String): The ID of your Google Spreadsheet.
*   `entityDefinitions` (Array): An array of definitions created with `createEntityDefinition`.

The returned context object will have properties for each entity (e.g., `db.Users`, `db.Posts`).

### `SheetSet` Methods
Each entity property on the context object is a `SheetSet` with the following methods:

*   `insert(obj)`: Inserts a new object as a row. Automatically generates a UUID for the `id` field. Returns the inserted object with the ID.
*   `update(id, obj)`: Updates the row corresponding to the given `id` with the new data from `obj`.
*   `remove(id)`: Deletes the row with the specified `id`. Respects deletion rules (`cascade`, `restrict`) defined in relationships.
*   `removeAll()`: Deletes all data rows from the sheet, leaving the header.
*   `all(depth = 0)`: Returns an array of all objects in the sheet.
    *   `depth` (Number): How many levels of relationships (`children` and `references`) to populate. `0` means no relationships are populated.
*   `findById(id, depth = 0)`: Returns a single object with the matching `id`, or `null` if not found. Populates relationships based on `depth`.
*   `where(callback)`: Returns an array of all objects that satisfy the filter function `callback`. Note: This loads all data and filters it in memory.