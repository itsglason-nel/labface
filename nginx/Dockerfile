FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create directory for certbot challenges
RUN mkdir -p /var/www/certbot

# Expose ports
EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
