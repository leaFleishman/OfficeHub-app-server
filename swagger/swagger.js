window.onload = () => {
  window.ui = SwaggerUIBundle({
    url: './openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'BaseLayout',
    persistAuthorization: true,
    tryItOutEnabled: true,
  });
};
