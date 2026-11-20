export function PageHead({ title, lede, account }: { title: string; lede: string; account?: boolean }) {
  return (
    <div className="head">
      <span className={account ? "badge acc" : "badge"}>{account ? "Saved to your account, encrypted" : "Runs in your browser, nothing uploaded"}</span>
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
    </div>
  );
}
