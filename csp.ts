/** Content Security Policy for the built pages. Not injected in dev, where Vite adds inline styles and HMR. */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' https://accounts.google.com/gsi/style",
  "connect-src 'self' https://graph.microsoft.com https://login.microsoftonline.com https://api.todoist.com https://tasks.googleapis.com https://oauth2.googleapis.com https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com https://login.microsoftonline.com",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

export function injectCsp(html: string): string {
  if (html.includes("Content-Security-Policy")) return html;
  return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
}
