import type { OpenApiSpec } from './restDocs';
import styles from './page.module.css';

interface SchemasTabProps {
  spec: OpenApiSpec;
  endpointCount: number;
}

export function SchemasTab({ spec, endpointCount }: SchemasTabProps) {
  const schemas = Object.entries(spec.components?.schemas ?? {});
  const schemes = Object.entries(spec.components?.securitySchemes ?? {});
  return (
    <div className={styles.schemasTab}>
      <section className={styles.mcpConnect}>
        <h2 className={styles.mcpTitle}>OpenAPI document</h2>
        <p className={styles.mcpText}>
          {spec.info.title} &middot; v{spec.info.version} &middot; {endpointCount} endpoints. Import
          it into Postman, Insomnia or a code generator.
        </p>
        <a className={styles.btnSecondary} href="/openapi.json" download="marketmitra-openapi.json">
          Download openapi.json
        </a>
      </section>

      {schemes.length > 0 && (
        <section className={styles.docSection}>
          <p className={styles.docSectionTitle}>Security schemes</p>
          <ul className={styles.plainList}>
            {schemes.map(([name, s]) => (
              <li key={name}>
                <code className={styles.paramName}>{name}</code>
                <span className={styles.paramDesc}> &mdash; {s.description ?? s.type}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {schemas.map(([name, schema]) => (
        <section key={name} className={styles.docSection}>
          <p className={styles.docSectionTitle}>{name}</p>
          <pre className={styles.pre}>
            <code>{JSON.stringify(schema, null, 2)}</code>
          </pre>
        </section>
      ))}
    </div>
  );
}
