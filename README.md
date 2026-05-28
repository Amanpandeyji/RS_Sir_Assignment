
## Notes
The app uses SQLite locally. On Vercel, the database file is created in the platform temp directory so claim writes can work during a live instance, but the data is still ephemeral and will not persist across deploys or cold starts.