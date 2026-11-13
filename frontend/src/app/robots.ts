import type { MetadataRoute } from "next";

/** Only the front sheet and the sign-in cards are public; workspaces, supplier links and invitations stay out of search. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/signin", "/signup"], disallow: ["/app", "/supplier", "/portal", "/invite", "/api"] }],
  };
}
