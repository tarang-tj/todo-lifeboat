/** The MSAL v5 redirect bridge page, next to the app. Works for root and sub-path deployments. */
export function redirectUri(pageHref: string): string {
  return new URL("redirect.html", pageHref).href;
}
