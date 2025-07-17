#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const shelljs = require('shelljs')

const exec = shelljs.exec;

const watchDevelopment = () => {

    const developmentDirectoryPath = process.env.HOME + '/Space/development';

    fs.watch(developmentDirectoryPath, (event) => {


        const devExcludes = ['', '.directory', '.megaignore']
        const developmentProjs = fs.readdirSync(`${developmentDirectoryPath}`).filter(proj => !devExcludes.includes(proj));
        
        console.log('developmentProjs', developmentProjs)

        exec(`mega-mkdir rspu/Space/development`)

        developmentProjs.forEach(proj => {

            const projPath = developmentDirectoryPath + `/${proj}`,
                  projPjsonPath = projPath + `/package.json`;

            exec(`mega-mkdir rspu/Space/development/${proj}`)
            exec(`mega-put ${projPjsonPath} rspu/Space/development/${proj}/package.json`)
            
        });

    })
}

watchDevelopment()

module.exports = watchDevelopment