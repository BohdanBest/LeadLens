FROM mcr.microsoft.com/dotnet/sdk:11.0 AS build
WORKDIR /src

COPY LeadLens.sln ./
COPY src/LeadLens.Domain/LeadLens.Domain.csproj src/LeadLens.Domain/
COPY src/LeadLens.Application/LeadLens.Application.csproj src/LeadLens.Application/
COPY src/LeadLens.Infrastructure/LeadLens.Infrastructure.csproj src/LeadLens.Infrastructure/
COPY src/LeadLens.Api/LeadLens.Api.csproj src/LeadLens.Api/
COPY tests/LeadLens.Tests/LeadLens.Tests.csproj tests/LeadLens.Tests/

RUN dotnet restore LeadLens.sln

COPY . .
RUN dotnet publish src/LeadLens.Api/LeadLens.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:11.0 AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .
EXPOSE 5000
ENTRYPOINT ["dotnet", "LeadLens.Api.dll"]
