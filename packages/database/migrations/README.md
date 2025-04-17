# Database Migrations

This directory contains tools for managing database migrations in Straia.

## Enabling the AI Agent Feature

The AI Agent feature requires database tables that might not be created in your current instance. When trying to use this feature, you might see a message like "Feature not available. Agent database tables have not been created yet."

To enable the AI Agent feature, you need to run the `add_agent_models` migration.

### Prerequisites

- Make sure you have administrator access to your Straia instance
- Ensure the PostgreSQL database is accessible
- Verify that Node.js is installed on your system

### Running the Migration

1. Navigate to the migrations directory:

```bash
cd packages/database/migrations
```

2. Run the migration script:

```bash
node run-migration.js add_agent_models
```

3. The script will:
   - Find the migration containing "add_agent_models" in the name
   - Apply the SQL statements to create the necessary tables
   - Update the migration history

4. Verify that the migration was successful by looking for the success message:

```
Migration executed successfully!
Migration history updated successfully!
The agent feature is now available.
```

### Troubleshooting

If you encounter any issues:

1. Ensure your database connection is configured correctly in your environment
2. Check that you have the necessary permissions to create tables in the database
3. Verify that the migration files exist in `prisma/migrations`

For further assistance, please contact support.

## Other Migrations

To run other migrations, use the same script with the appropriate migration name:

```bash
node run-migration.js <migration-name>
```

The script will display available migrations if the specified one is not found. 