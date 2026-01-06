FROM node:latest
RUN apt-get update && apt-get install -y wget unzip
RUN wget https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip
RUN unzip Xray-linux-64.zip && chmod +x xray
COPY config.json /config.json
CMD ./xray -c /config.json
