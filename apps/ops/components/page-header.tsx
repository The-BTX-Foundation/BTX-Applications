// The page title block: a 32px title with an optional muted line under it, and room on the right for actions.
export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="o-top">
      <div className="o-top-t">
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {children ? <div className="o-top-a">{children}</div> : null}
    </div>
  );
}
