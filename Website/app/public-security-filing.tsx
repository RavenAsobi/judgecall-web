const PUBLIC_SECURITY_FILING_URL =
  "https://beian.mps.gov.cn/#/query/webSearch?code=21011202001362";

export function PublicSecurityFiling() {
  return (
    <a
      className="public-security-filing"
      href={PUBLIC_SECURITY_FILING_URL}
      rel="noreferrer"
      target="_blank"
    >
      <img src="/police.png" alt="" width="18" height="20" />
      <span>辽公网安备21011202001362号</span>
    </a>
  );
}
