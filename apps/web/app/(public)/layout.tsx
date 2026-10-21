/**
 * Pages anyone with the link can open (buyer deal pages). No app shell, no
 * session: the api checks the link's token on every request.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
