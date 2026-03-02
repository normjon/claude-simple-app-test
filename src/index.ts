import app from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(JSON.stringify({
    level: 'info',
    message: `Server started on port ${PORT}`,
    timestamp: new Date().toISOString()
  }));
});
