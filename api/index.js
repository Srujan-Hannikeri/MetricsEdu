const app = require('../server/server');

module.exports = (req, res) => {
  try {
    const requestUrl = new URL(req.url, 'http://localhost');
    const routeParam = requestUrl.searchParams.get('__metricsedu_route');

    if (routeParam !== null) {
      requestUrl.searchParams.delete('__metricsedu_route');
      const cleanRoute = routeParam.replace(/^\/+/, '');
      const search = requestUrl.searchParams.toString();
      req.url = `/api/${cleanRoute}${search ? `?${search}` : ''}`;
    } else if (!req.url.startsWith('/api')) {
      req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
    }

    return app(req, res);
  } catch (err) {
    console.error('API Router Error:', err);
    return app(req, res);
  }
};
