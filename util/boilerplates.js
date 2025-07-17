import fs from 'fs'

const dir = '/usr/lib/rsp/boilerplates'

export default {
    dir,
    list: () => ['raw', ...fs.readdirSync(dir)]
}