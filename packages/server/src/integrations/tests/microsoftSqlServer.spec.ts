import sqlServer from "mssql"
import { buildNtlmAuthentication } from "../microsoftSqlServer"

/**
 * `mssql` builds its tedious config with
 * `Object.assign({ type, options: { userName, password, ... } }, config.authentication)`
 * (`lib/tedious/connection-pool.js`), so the `options` object we hand it
 * replaces the library's instead of merging with it. Anything missing here
 * never reaches tedious, and a missing `userName` makes the NTLM challenge
 * handler read `undefined`.
 */
const mergeLikeMssql = (
  authentication: ReturnType<typeof buildNtlmAuthentication>
) =>
  Object.assign(
    {
      type: "ntlm",
      options: {
        userName: "resolved-by-mssql",
        password: "resolved-by-mssql",
      },
    },
    authentication
  )

describe("MSSQL Integration", () => {
  describe("buildNtlmAuthentication", () => {
    const credentials = {
      user: "CORP\\alice",
      password: "s3cret",
      domain: "CORP",
    }

    it("keeps the username mssql would otherwise overwrite", () => {
      const merged = mergeLikeMssql(buildNtlmAuthentication(credentials))

      expect(merged.options).toMatchObject({
        userName: credentials.user,
      })
    })

    it("keeps the password and the domain", () => {
      const merged = mergeLikeMssql(buildNtlmAuthentication(credentials))

      expect(merged.options).toEqual({
        domain: credentials.domain,
        userName: credentials.user,
        password: credentials.password,
      })
    })

    it("still reports the auth type as ntlm", () => {
      const merged = mergeLikeMssql(buildNtlmAuthentication(credentials))

      expect(merged.type).toBe("ntlm")
    })
  })

  describe("connection pool errors", () => {
    // mssql re-emits every non-ESOCKET tedious error on the pool, so a `connect`
    // attempt that fails with anything other than a socket error arrives here
    // rather than at the `await pool.connect()` caller. With no listener Node
    // turns the emit into an uncaught exception and the whole server exits.
    it("does not throw when the pool re-emits a tedious error", () => {
      const pool = new sqlServer.ConnectionPool({
        server: "db.example.com",
        user: "alice",
        password: "s3cret",
      })
      pool.on("error", () => {})

      expect(() =>
        pool.emit("error", new Error("ConnectionError: failed to connect"))
      ).not.toThrow()
    })
  })
})
