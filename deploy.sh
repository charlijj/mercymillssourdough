#!/bin/bash

git pull
npm run build && firebase deploy
cd worker && npx wrangler@4 deploy
