declare const __APP_VERSION__: string;
declare const __REPO__: string;
declare const __AUTHOR__: string;
declare const __COMMUNITY_URL__: string;

declare module "*?raw" {
  const content: string;
  export default content;
}
declare module "*.md" {
  const url: string;
  export default url;
}
declare module "*.json" {
  const value: unknown;
  export default value;
}