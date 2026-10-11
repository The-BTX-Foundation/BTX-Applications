// Text helpers for long real-world values.
//  - Name keeps each part of a name whole: "Adaeze-Grace" never breaks at its hyphen, and the line only breaks
//    between the parts.
//  - FileName lets a long file name wrap after each underscore (and at hyphens), never in the middle of a word.
import { Fragment } from 'react';

export function Name({ children }: { children: string }) {
  const parts = children.split(' ');
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 ? ' ' : null}
          <span style={{ whiteSpace: 'nowrap' }}>{p}</span>
        </Fragment>
      ))}
    </>
  );
}

export function FileName({ children }: { children: string }) {
  const parts = children.split('_');
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 ? (
            <>
              _<wbr />
            </>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}
