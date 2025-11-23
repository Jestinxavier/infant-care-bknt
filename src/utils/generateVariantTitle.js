export function generateVariantTitle(parentTitle, attributes, variantOptions) {
  const parts = [];

  for (const opt of variantOptions) {
    const valueId = attributes?.[opt?.code];
    const valueObj = opt?.values?.find((v) => v?.id === valueId);
    if (valueObj) parts.push(valueObj?.label);
  }

  return `${parentTitle} - ${parts?.join(" - ")}`.trim();
}
