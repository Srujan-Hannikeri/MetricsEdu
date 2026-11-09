const app = require('../server/server');

module.exports = (req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  const routes = requestUrl.searchParams.getAll('__metricsedu_route');
  requestUrl.searchParams.delete('__metricsedu_route');

  if (routes.length !== 1) {
    return res.status(400).json({ success: false, message: 'Invalid API route.' });
  }

  const segments = routes[0].split('/');
  if (segments.some(segment => segment === '.' || segment === '..')) {
    return res.status(400).json({ success: false, message: 'Invalid API route.' });
  }

  const apiPath = `/api/${segments.map(encodeURIComponent).join('/')}`;
  req.url = `${apiPath}${requestUrl.search}`;
  return app(req, res);
};
