// The small "Board test" label shown beside an applicant's name when the application is a board member's Portal test
// (lib/test-application.ts). Renders nothing otherwise. An <i> so list styles that target b / span do not restyle it.
export function BoardTest({ test }: { test?: boolean }) {
  return test ? <i className="o-bt">Board test</i> : null;
}
