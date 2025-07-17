import { 
  initializeRepository,
  runValidation,
  syncRepository,
  checkStatus,
  gitCompress,
  gitAddRemote,
  gitUnremote,
  gitAddOrigin,
  gitUnorigin,
  gitOffsite,
  gitVisit
} from '../api/index.js';

import boilerplates from '../util/boilerplates.js';
import RSp from 'file:///usr/lib/node_modules/rsp-libcore.js/index.js'

export default () => {

  new RSp.Cli('rsp-develop', {

    init: {
      example: 'rsp-develop init',
      description: 'Initialize a new Git repository with proper structure',
      options: boilerplates.list(),
      execute: (option) => initializeRepository(option)
    },
    sync: {
      example: 'rsp-develop sync',
      description: 'Sync changes to both dev and main branches',
      execute: () => syncRepository()
    },
    check: {
      example: 'rsp-develop check',
      description: 'Run repository validation (default command)',
      execute: () => runValidation()
    },
    status: {
      example: 'rsp-develop status',
      description: 'Show the overall status of repo between local and remote',
      execute: () => checkStatus()
    },
    visit: {
      example: 'rsp-develop visit',
      description: 'Go to remote repository github web page',
      execute: () => gitVisit()
    },
    remote: {
      example: 'rsp-develop remote public',
      description: 'Create remote repository for current local repo',
      options: ['public', 'private'],
      execute: (option) => gitAddRemote(option)
    },
    origin: {
      example: 'rsp-develop origin',
      description: 'Setup remote origin repository for current local repo',
      execute: () => gitAddOrigin()
    },
    unorigin: {
      example: 'rsp-develop unorigin',
      description: 'Unlink remote repository of current repo',
      execute: () => gitUnorigin()
    },
    unremote: {
      example: 'rsp-develop unremote --confirmed',
      description: 'Delete remote repository of current repo (caution)',
      options: ['confirmed'],
      execute: (option) => gitUnremote(option)
    },
    offsite: {
      example: 'rsp-develop offsite',
      description: 'Check repository has remote && up to date: remove it from local',
      execute: () => gitOffsite()
    },
    compress: {
      example: 'rsp-develop compress',
      description: 'Setup git compression for large repository',
      execute: () => gitCompress()
    }
  })

}
