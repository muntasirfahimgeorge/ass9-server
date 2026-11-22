import test from "node:test";
import assert from "node:assert/strict";

// Tests do not require a real MongoDB connection.
process.env.DB_URI ??= "mongodb://127.0.0.1:27017/fixmate_test";

const { default: app } = await import("../src/app.js");

async function withServer(callback) {
  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

test("GET /api/health returns a successful health response", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      success: true,
      message: "FixMate server is running",
      data: {
        status: "ok",
        application: "FixMate API",
      },
    });
  });
});

test("Unknown API route returns a 404 response", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/unknown-test-route`
    );

    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(
      body.message,
      "Route not found: GET /api/unknown-test-route"
    );
  });
});

test("Invalid JSON request returns a 400 response", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: '{"invalid":',
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      success: false,
      message: "Invalid JSON in request body",
    });
  });
});
