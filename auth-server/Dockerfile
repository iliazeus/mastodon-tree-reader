FROM golang:1.23-alpine AS build
WORKDIR /app
COPY main.go /app/main.go
RUN go build -v -o /app/main /app/main.go

FROM scratch
WORKDIR /app
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /app/main /app/main
EXPOSE 8080
CMD [ "/app/main" ]
