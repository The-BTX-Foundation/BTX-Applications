// The page title block: a 32px title with an optional muted line under it, and room on the right for actions.
export function PageHeader({ title, sub, children, actionsClass }: { title: string; sub?: React.ReactNode; children?: React.ReactNode; actionsClass?: string }) {
  return (
    <div className="o-top">
      <div className="o-top-t">
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {children ? <div className={`o-top-a${actionsClass ? ` ${actionsClass}` : ''}`}>{children}</div> : null}
    </div>
  );
}
