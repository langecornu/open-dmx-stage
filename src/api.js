// Single place for HTTP access to the server. Every call checks res.ok and throws a readable error.
async function request(path, options) {
  const res = await fetch(`/api/v1${path}`, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // The body was not JSON; keep the generic message.
    }
    throw new Error(message);
  }
  return res.json();
}

const jsonBody = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  getProject: () => request('/project'),
  saveProject: (project) => request('/project', jsonBody('PUT', project)),
  importProject: (project) => request('/project/import', jsonBody('POST', project)),
  getFixtureLibrary: () => request('/fixtures/library'),
  importOpenFixture: (fixture, manufacturer) =>
    request('/fixtures/import-ofl', jsonBody('POST', { fixture, manufacturer })),
  searchOpenFixtureLibrary: (query) => request(`/fixtures/ofl/search?q=${encodeURIComponent(query)}`),
  getOpenFixtureDetails: (key) => request(`/fixtures/ofl/details?key=${encodeURIComponent(key)}`),
  importFromOpenFixtureLibrary: (key) => request('/fixtures/ofl/import', jsonBody('POST', { key })),
  importQlcFixture: (xml) => request('/fixtures/import-qlc', jsonBody('POST', { xml })),
  detectAdapter: (serialPath) => request('/output/detect', jsonBody('POST', { serialPath })),
  listOutputPorts: () => request('/output/ports'),
  saveOutputSettings: (settings) => request('/output/settings', jsonBody('PUT', settings)),
  getOutput: () => request('/output'),
};
