declare module 'virtual:api-docs' {
  export type ApiDocParam = {
    name: string
    type: string
    description: string
  }

  export type ApiDocResponse = {
    status: string
    description: string
  }

  export type ApiDoc = {
    method: string
    path: string
    tag: string
    summary: string
    auth: string
    params: ApiDocParam[]
    query: ApiDocParam[]
    body: string | null
    responses: ApiDocResponse[]
  }

  const docs: ApiDoc[]
  export default docs
}
